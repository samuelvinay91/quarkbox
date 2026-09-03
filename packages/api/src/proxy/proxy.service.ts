import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { SandboxService } from '../sandbox/sandbox.service';
import { Response } from 'express';
import { Readable } from 'node:stream';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  // Time to wait for the upstream port to respond at all (headers received).
  // Unchanged from the prior flat timeout — dead/unroutable ports should
  // still fail fast into the in-container exec fallback below.
  private static readonly CONNECT_TIMEOUT_MS = 2000;

  // Time to wait between chunks once a streaming response is underway.
  // Long enough for a typical SSE heartbeat cadence (most implementations
  // ping every 15-30s) without holding a truly-stalled connection forever.
  private static readonly IDLE_TIMEOUT_MS = 60000;

  constructor(
    @Inject(SandboxService) private readonly sandboxService: SandboxService,
  ) {}

  /**
   * Proxy an incoming HTTP request to a target port inside the sandbox
   */
  async forwardRequest(
    sandboxId: string,
    port: number,
    subpath: string,
    method: string,
    headers: Record<string, any>,
    body: any,
    res: Response,
  ): Promise<void> {
    const sandbox = await this.sandboxService.findOne(sandboxId);

    const cleanSubpath = subpath ? subpath.replace(/^\//, '') : '';
    if (!/^[a-zA-Z0-9/_\-\.]*$/.test(cleanSubpath)) {
      throw new BadRequestException('Invalid subpath');
    }
    if (cleanSubpath.split(/[/\\]/).some((segment) => segment === '..')) {
      throw new BadRequestException('Invalid subpath');
    }
    if (!/^[A-Z]+$/.test(method)) {
      throw new BadRequestException('Invalid HTTP method');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BadRequestException('Invalid port');
    }
    const targetUrl = sandbox.containerIp
      ? `http://${sandbox.containerIp}:${port}/${cleanSubpath}`
      : `http://127.0.0.1:${port}/${cleanSubpath}`;

    this.logger.debug(`Proxying ${method} -> ${targetUrl}`);

    // Try Direct HTTP Fetch, streaming the response through rather than
    // buffering it whole — required for Server-Sent Events / any long-lived
    // upstream response (e.g. a hosted MCP server's HTTP transport), which a
    // full-buffer approach silently breaks.
    const controller = new AbortController();
    let watchdog: NodeJS.Timeout | undefined;
    const armWatchdog = (ms: number) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => controller.abort(), ms);
    };
    const clearWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = undefined;
    };
    const onClientClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', onClientClose);

    let headersFlushed = false;
    try {
      const filteredHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        if (!['host', 'connection', 'content-length'].includes(k.toLowerCase()) && typeof v === 'string') {
          filteredHeaders[k] = v;
        }
      }

      armWatchdog(ProxyService.CONNECT_TIMEOUT_MS);

      const proxyRes = await fetch(targetUrl, {
        method,
        headers: filteredHeaders,
        body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      // Headers are in — from here on the response is committed. A failure
      // past this point can only terminate the connection, never fall back
      // to the exec path or a fresh JSON error body.
      res.status(proxyRes.status);
      proxyRes.headers.forEach((v, k) => {
        const lower = k.toLowerCase();
        if (!['content-length', 'transfer-encoding', 'connection'].includes(lower)) {
          res.setHeader(k, v);
        }
      });
      res.flushHeaders();
      headersFlushed = true;

      if (proxyRes.body) {
        const upstream = Readable.fromWeb(proxyRes.body as any);
        armWatchdog(ProxyService.IDLE_TIMEOUT_MS);
        for await (const chunk of upstream) {
          if (res.writableEnded) {
            upstream.destroy();
            break;
          }
          armWatchdog(ProxyService.IDLE_TIMEOUT_MS);
          res.write(chunk);
        }
      }

      clearWatchdog();
      res.end();
      return;
    } catch (err) {
      clearWatchdog();
      this.logger.debug(`Proxy request to ${targetUrl} failed: ${err instanceof Error ? err.message : err}`);

      if (headersFlushed) {
        // Response already committed to the client — nothing left to do but
        // stop. No exec fallback (a partial response is already on the
        // wire) and no fresh error body (the status line is already sent).
        if (!res.writableEnded) res.end();
        return;
      }

      // Direct network unroutable (e.g. macOS Docker Desktop VM bridge), or
      // the port never responded within the connect timeout -> fall back to
      // in-container curl. This fallback is buffer-only by construction (a
      // single `exec` call captures one final stdout) and can't support
      // streaming — it's a last resort for simple GET/HEAD-style checks.
      try {
        // Universal HTTP request command inside container (works with Python, Node, or Curl)
        const universalCmd = `if command -v python3 >/dev/null 2>&1; then ` +
          `python3 -c "import urllib.request; req=urllib.request.Request('http://127.0.0.1:${port}/${cleanSubpath}', method='${method}'); res=urllib.request.urlopen(req, timeout=3); print(res.read().decode())"; ` +
          `elif command -v curl >/dev/null 2>&1; then ` +
          `curl -s -X ${method} "http://127.0.0.1:${port}/${cleanSubpath}"; ` +
          `elif command -v wget >/dev/null 2>&1; then ` +
          `wget -qO- "http://127.0.0.1:${port}/${cleanSubpath}"; ` +
          `elif command -v node >/dev/null 2>&1; then ` +
          `node -e "http=require('http');http.get('http://127.0.0.1:${port}/${cleanSubpath}',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"; ` +
          `fi`;

        const execRes = await this.sandboxService.exec(sandbox.id, universalCmd);

        if (execRes.exitCode !== 0 || !execRes.stdout) {
          res.status(502).json({
            error: `Port ${port} inside sandbox is not responding`,
            details: execRes.stderr || 'No response from service inside container',
          });
          return;
        }

        res.status(200);
        res.setHeader('Content-Type', 'application/json');
        res.send(execRes.stdout.trim());
        return;
      } catch (innerErr: any) {
        res.status(502).json({
          error: `Could not reach target service on port ${port} inside sandbox`,
          details: innerErr.message,
        });
      }
    }
  }

  /**
   * Get preview URLs for all active ports of a sandbox
   */
  async getPreviewUrls(sandboxId: string): Promise<
    Array<{ port: string; url: string; label: string }>
  > {
    const sandbox = await this.sandboxService.findOne(sandboxId);
    const ports = sandbox.ports || { '3000': '3000', '8080': '8080' };

    return Object.keys(ports).map((port) => ({
      port,
      url: `/api/proxy/${sandboxId}/${port}/`,
      label: `Port ${port} (HTTP)`,
    }));
  }
}
