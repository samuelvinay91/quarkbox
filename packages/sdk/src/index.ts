/**
 * QuarkBox TypeScript SDK
 *
 * Provides programmatic access to QuarkBox cloud sandboxes.
 *
 * @example
 * ```typescript
 * import { QuarkBox } from '@quarkbox/sdk';
 *
 * const qb = new QuarkBox({
 *   apiUrl: 'http://localhost:3000/api',
 *   apiKey: 'qb_your_api_key',
 * });
 *
 * // Create a sandbox
 * const sandbox = await qb.sandboxes.create({
 *   name: 'my-dev-env',
 *   image: 'python:3.12-slim',
 * });
 *
 * // Execute a command
 * const result = await sandbox.exec('echo "Hello from QuarkBox"');
 * console.log(result.stdout); // "Hello from QuarkBox"
 *
 * // Stop and clean up
 * await sandbox.stop();
 * await sandbox.remove();
 * ```
 */

export interface QuarkBoxConfig {
  /** Base URL of the QuarkBox API (e.g., http://localhost:3000/api) */
  apiUrl: string;
  /** API key or JWT token for authentication */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface SandboxCreateOptions {
  name: string;
  description?: string;
  image?: string;
  runtime?: 'docker' | 'containerd' | 'firecracker';
  cpuLimit?: number;
  memoryLimit?: string;
  ports?: Record<string, string>;
  envVars?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface SandboxInfo {
  id: string;
  name: string;
  description?: string;
  status: string;
  runtime: string;
  image: string;
  containerIp?: string;
  cpuLimit: number;
  memoryLimit: string;
  ports: Record<string, string>;
  envVars: Record<string, string>;
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ─── Error ───────────────────────────────────────────────────────────

export class QuarkBoxError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'QuarkBoxError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function assertValidId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new QuarkBoxError(`Invalid ID: expected a UUID, got "${id}"`);
  }
}

const MEMORY_RE = /^\d+[mMgG]$/;

function validateCreateOptions(options: SandboxCreateOptions): void {
  if (
    typeof options.name !== 'string' ||
    options.name.trim().length === 0 ||
    options.name.length > 100
  ) {
    throw new QuarkBoxError(
      'Invalid option: name must be a non-empty string (max 100 characters)',
    );
  }

  if (options.cpuLimit !== undefined) {
    if (
      typeof options.cpuLimit !== 'number' ||
      !Number.isInteger(options.cpuLimit) ||
      options.cpuLimit <= 0
    ) {
      throw new QuarkBoxError(
        'Invalid option: cpuLimit must be a positive integer',
      );
    }
  }

  if (options.memoryLimit !== undefined && !MEMORY_RE.test(options.memoryLimit)) {
    throw new QuarkBoxError(
      'Invalid option: memoryLimit must match pattern /\\d+[mMgG]/ (e.g. "512m", "2g")',
    );
  }

  if (options.ports !== undefined) {
    for (const [key, value] of Object.entries(options.ports)) {
      if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        throw new QuarkBoxError(
          `Invalid option: ports["${key}"] must be a numeric string`,
        );
      }
    }
  }

  if (options.envVars !== undefined) {
    for (const key of Object.keys(options.envVars)) {
      if (/[=\s]/.test(key)) {
        throw new QuarkBoxError(
          `Invalid option: envVars key "${key}" contains '=' or whitespace`,
        );
      }
    }
  }
}

// ─── HTTP Client ─────────────────────────────────────────────────────

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);

class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly timeout: number = 30000,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 0,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let lastError: unknown;
    const attempts = IDEMPOTENT_METHODS.has(method.toUpperCase())
      ? 1 + retries
      : 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new QuarkBoxError(
            (error as { message?: string }).message ||
              `HTTP ${response.status}: ${response.statusText}`,
            response.status,
          );
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err;
        if (err instanceof QuarkBoxError) throw err;

        const isAbort =
          err instanceof DOMException && err.name === 'AbortError';
        if (isAbort) {
          throw new QuarkBoxError(
            `Request to ${path} timed out after ${this.timeout}ms`,
          );
        }

        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
          continue;
        }

        throw new QuarkBoxError(
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError instanceof Error
      ? new QuarkBoxError(lastError.message)
      : new QuarkBoxError(String(lastError));
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

// ─── Sandbox Handle ──────────────────────────────────────────────────

/**
 * A handle to a specific sandbox instance.
 * Provides methods to interact with and manage the sandbox.
 */
export class SandboxHandle {
  constructor(
    private readonly http: HttpClient,
    public readonly info: SandboxInfo,
  ) {}

  get id(): string {
    return this.info.id;
  }
  get name(): string {
    return this.info.name;
  }
  get status(): string {
    return this.info.status;
  }

  /** Refresh sandbox info from the server */
  async refresh(): Promise<SandboxInfo> {
    const updated = await this.http.get<SandboxInfo>(
      `/sandboxes/${encodeURIComponent(this.info.id)}`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Execute a command inside the sandbox */
  async exec(command: string, workdir?: string): Promise<ExecResult> {
    return this.http.post<ExecResult>(
      `/sandboxes/${encodeURIComponent(this.info.id)}/exec`,
      { command, workdir },
    );
  }

  /** Execute Python code natively inside the sandbox */
  async runPython(code: string): Promise<ExecResult> {
    return this.http.post<ExecResult>(
      `/sandboxes/${encodeURIComponent(this.info.id)}/run-python`,
      { code },
    );
  }

  /** Start a stopped sandbox */
  async start(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${encodeURIComponent(this.info.id)}/start`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Stop a running sandbox */
  async stop(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${encodeURIComponent(this.info.id)}/stop`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Pause a running sandbox */
  async pause(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${encodeURIComponent(this.info.id)}/pause`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Resume a paused sandbox */
  async resume(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${encodeURIComponent(this.info.id)}/resume`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Remove (delete) the sandbox */
  async remove(): Promise<void> {
    await this.http.delete(
      `/sandboxes/${encodeURIComponent(this.info.id)}`,
    );
  }
}

// ─── Sandbox Manager ─────────────────────────────────────────────────

class SandboxManager {
  constructor(private readonly http: HttpClient) {}

  /** Create a new sandbox */
  async create(options: SandboxCreateOptions): Promise<SandboxHandle> {
    validateCreateOptions(options);
    const info = await this.http.post<SandboxInfo>('/sandboxes', options);
    return new SandboxHandle(this.http, info);
  }

  /** List all sandboxes */
  async list(): Promise<SandboxInfo[]> {
    return this.http.get<SandboxInfo[]>('/sandboxes');
  }

  /** Get a sandbox by ID */
  async get(id: string): Promise<SandboxHandle> {
    assertValidId(id);
    const info = await this.http.get<SandboxInfo>(
      `/sandboxes/${encodeURIComponent(id)}`,
    );
    return new SandboxHandle(this.http, info);
  }

  /** Delete a sandbox by ID */
  async remove(id: string): Promise<void> {
    assertValidId(id);
    await this.http.delete(`/sandboxes/${encodeURIComponent(id)}`);
  }
}

// ─── Main Client ─────────────────────────────────────────────────────

/**
 * QuarkBox SDK Client
 *
 * Main entry point for interacting with the QuarkBox API.
 */
export class QuarkBox {
  private readonly http: HttpClient;
  public readonly sandboxes: SandboxManager;

  constructor(config: QuarkBoxConfig) {
    const apiUrl = config.apiUrl.replace(/\/$/, '');
    if (
      apiUrl.startsWith('http://') &&
      !apiUrl.startsWith('http://localhost') &&
      !apiUrl.startsWith('http://127.0.0.1')
    ) {
      throw new QuarkBoxError(
        'Invalid API URL: must use https:// in production',
      );
    }
    this.http = new HttpClient(apiUrl, config.apiKey, config.timeout);
    this.sandboxes = new SandboxManager(this.http);
  }

  /** Check if the API is reachable */
  async health(): Promise<{ status: string; version: string }> {
    return this.http.get('/health');
  }
}

export default QuarkBox;
