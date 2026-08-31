/**
 * Runtime Provider Interface
 *
 * Abstracts the container/VM runtime so we can swap between
 * Docker, containerd, and Firecracker without changing business logic.
 */

export interface RuntimeInfo {
  id: string;
  status: 'running' | 'paused' | 'stopped' | 'created' | 'unknown';
  ip?: string;
  ports?: Record<string, string>;
  createdAt?: Date;
  pid?: number;
}

export interface RuntimeCreateOptions {
  name: string;
  image: string;
  cpuLimit: number;
  memoryLimit: string;
  diskLimit?: string;
  ports?: Record<string, string>;
  envVars?: Record<string, string>;
  labels?: Record<string, string>;
  network?: string;
  command?: string[];
  volumes?: Array<{ host: string; container: string; readonly?: boolean }>;
}

export interface ExecOptions {
  containerId: string;
  command: string[];
  workdir?: string;
  env?: Record<string, string>;
  tty?: boolean;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const RUNTIME_PROVIDER = 'RUNTIME_PROVIDER';

export interface RuntimeProvider {
  /** Provider name for logging and identification */
  readonly name: string;

  /** Pull a container/VM image */
  pullImage(image: string): Promise<void>;

  /** Create and start a sandbox */
  create(options: RuntimeCreateOptions): Promise<RuntimeInfo>;

  /** Start a stopped sandbox */
  start(id: string): Promise<void>;

  /** Stop a running sandbox */
  stop(id: string, timeout?: number): Promise<void>;

  /** Pause a running sandbox (CRIU checkpoint if supported) */
  pause(id: string): Promise<void>;

  /** Resume a paused sandbox */
  resume(id: string): Promise<void>;

  /** Remove a sandbox completely */
  remove(id: string, force?: boolean): Promise<void>;

  /** Get sandbox info */
  inspect(id: string): Promise<RuntimeInfo | null>;

  /** Execute a command inside a sandbox */
  exec(options: ExecOptions): Promise<ExecResult>;

  /** List all sandboxes managed by this provider */
  list(labels?: Record<string, string>): Promise<RuntimeInfo[]>;

  /** Check if the runtime is available */
  healthCheck(): Promise<boolean>;

  /** Get real-time resource usage stats for a running container */
  stats(id: string): Promise<ContainerStats>;
}

export interface ContainerStats {
  containerId: string;
  cpu: {
    usagePercent: number;       // 0–100 per core
    systemCpuDelta: number;
    numCpus: number;
  };
  memory: {
    usageMb: number;
    limitMb: number;
    usagePercent: number;
    cache: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
  };
  blockIO: {
    readBytes: number;
    writeBytes: number;
  };
  pids: number;
  readAt: string;
}
