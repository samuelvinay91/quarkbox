import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { SandboxService } from '../sandbox/sandbox.service';
import { Response } from 'express';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

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

    // Try Direct HTTP Fetch
    try {
      const filteredHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        if (!['host', 'connection', 'content-length'].includes(k.toLowerCase()) && typeof v === 'string') {
          filteredHeaders[k] = v;
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const proxyRes = await fetch(targetUrl, {
        method,
        headers: filteredHeaders,
        body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      res.status(proxyRes.status);
      proxyRes.headers.forEach((v, k) => {
        res.setHeader(k, v);
      });

      const buffer = await proxyRes.arrayBuffer();
      res.send(Buffer.from(buffer));
      return;
    } catch {
      // Direct network unroutable (e.g. macOS Docker Desktop VM bridge) -> Fallback to in-container curl
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
