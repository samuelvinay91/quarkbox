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

// ─── HTTP Client ─────────────────────────────────────────────────────

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
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

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
    } finally {
      clearTimeout(timeoutId);
    }
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

// ─── Error ───────────────────────────────────────────────────────────

export class QuarkBoxError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'QuarkBoxError';
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
      `/sandboxes/${this.info.id}`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Execute a command inside the sandbox */
  async exec(command: string, workdir?: string): Promise<ExecResult> {
    return this.http.post<ExecResult>(`/sandboxes/${this.info.id}/exec`, {
      command,
      workdir,
    });
  }

  /** Execute Python code natively inside the sandbox */
  async runPython(code: string): Promise<ExecResult> {
    return this.http.post<ExecResult>(`/sandboxes/${this.info.id}/run-python`, {
      code,
    });
  }

  /** Start a stopped sandbox */
  async start(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${this.info.id}/start`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Stop a running sandbox */
  async stop(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${this.info.id}/stop`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Pause a running sandbox */
  async pause(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${this.info.id}/pause`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Resume a paused sandbox */
  async resume(): Promise<SandboxInfo> {
    const updated = await this.http.post<SandboxInfo>(
      `/sandboxes/${this.info.id}/resume`,
    );
    Object.assign(this.info, updated);
    return this.info;
  }

  /** Remove (delete) the sandbox */
  async remove(): Promise<void> {
    await this.http.delete(`/sandboxes/${this.info.id}`);
  }
}

// ─── Sandbox Manager ─────────────────────────────────────────────────

class SandboxManager {
  constructor(private readonly http: HttpClient) {}

  /** Create a new sandbox */
  async create(options: SandboxCreateOptions): Promise<SandboxHandle> {
    const info = await this.http.post<SandboxInfo>('/sandboxes', options);
    return new SandboxHandle(this.http, info);
  }

  /** List all sandboxes */
  async list(): Promise<SandboxInfo[]> {
    return this.http.get<SandboxInfo[]>('/sandboxes');
  }

  /** Get a sandbox by ID */
  async get(id: string): Promise<SandboxHandle> {
    const info = await this.http.get<SandboxInfo>(`/sandboxes/${id}`);
    return new SandboxHandle(this.http, info);
  }

  /** Delete a sandbox by ID */
  async remove(id: string): Promise<void> {
    await this.http.delete(`/sandboxes/${id}`);
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
    this.http = new HttpClient(
      config.apiUrl.replace(/\/$/, ''),
      config.apiKey,
      config.timeout,
    );
    this.sandboxes = new SandboxManager(this.http);
  }

  /** Check if the API is reachable */
  async health(): Promise<{ status: string; version: string }> {
    return this.http.get('/health');
  }
}

export default QuarkBox;
