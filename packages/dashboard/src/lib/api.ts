/**
 * QuarkBox Dashboard API Client
 * Communicates with the NestJS API server.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API Error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────

export interface Sandbox {
  id: string;
  name: string;
  description?: string;
  status: "creating" | "running" | "paused" | "stopped" | "error" | "deleting";
  runtime: string;
  image: string;
  containerId?: string;
  containerIp?: string;
  cpuLimit: number;
  memoryLimit: string;
  diskLimit: string;
  ports: Record<string, string>;
  envVars: Record<string, string>;
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}

export interface CreateSandboxInput {
  name: string;
  description?: string;
  image?: string;
  runtime?: "docker" | "containerd" | "firecracker";
  cpuLimit?: number;
  memoryLimit?: string;
  ports?: Record<string, string>;
  envVars?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Activity {
  id: string;
  type: string;
  summary: string;
  metadata?: Record<string, unknown>;
  sandboxId?: string;
  source?: string;
  durationMs?: number;
  isError: boolean;
  createdAt: string;
}

export interface ActivityFeed {
  items: Activity[];
  total: number;
}

export interface ActivityStats {
  totalEvents: number;
  commandsExecuted: number;
  errorsToday: number;
  avgExecDurationMs: number;
}

export interface Snapshot {
  id: string;
  name: string;
  description?: string;
  status: string;
  sandboxId?: string;
  snapshotImage: string;
  sizeBytes: number;
  createdAt: string;
  sandbox?: Sandbox;
}

export interface PoolStatusItem {
  image: string;
  target: number;
  warm: number;
}

// ── Sandbox API ──────────────────────────────────────────────────────

export const sandboxApi = {
  list: () => request<Sandbox[]>("GET", "/sandboxes"),
  get: (id: string) => request<Sandbox>("GET", `/sandboxes/${id}`),
  create: (input: CreateSandboxInput) =>
    request<Sandbox>("POST", "/sandboxes", input),
  delete: (id: string) => request<void>("DELETE", `/sandboxes/${id}`),
  start: (id: string) => request<Sandbox>("POST", `/sandboxes/${id}/start`),
  stop: (id: string) => request<Sandbox>("POST", `/sandboxes/${id}/stop`),
  pause: (id: string) => request<Sandbox>("POST", `/sandboxes/${id}/pause`),
  resume: (id: string) => request<Sandbox>("POST", `/sandboxes/${id}/resume`),
  exec: (id: string, command: string, workdir?: string) =>
    request<ExecResult>("POST", `/sandboxes/${id}/exec`, { command, workdir }),
};

// ── Snapshot & Fork API ──────────────────────────────────────────────

export const snapshotApi = {
  list: (sandboxId?: string) =>
    request<Snapshot[]>("GET", `/snapshots${sandboxId ? `?sandboxId=${sandboxId}` : ""}`),
  get: (id: string) => request<Snapshot>("GET", `/snapshots/${id}`),
  create: (sandboxId: string, name: string, description?: string) =>
    request<Snapshot>("POST", `/snapshots/sandbox/${sandboxId}`, { name, description }),
  fork: (sandboxId: string, forkName: string) =>
    request<Snapshot>("POST", `/snapshots/sandbox/${sandboxId}/fork`, { forkName }),
  delete: (id: string) => request<void>("DELETE", `/snapshots/${id}`),
};

// ── Pool API ─────────────────────────────────────────────────────────

export const poolApi = {
  status: () => request<PoolStatusItem[]>("GET", "/pool/status"),
  replenish: () => request<{ status: string }>("POST", "/pool/replenish"),
};

// ── Context Layer API ────────────────────────────────────────────────

export const contextApi = {
  createFromRepo: (params: {
    name: string;
    repoUrl: string;
    branch?: string;
    image?: string;
    setupScript?: string;
  }) => request<Sandbox>("POST", "/context/create-from-repo", params),
  injectGit: (sandboxId: string, repoUrl: string, branch?: string) =>
    request<{ stdout: string }>("POST", `/context/sandbox/${sandboxId}/git`, { repoUrl, branch }),
};

// ── Activity API ─────────────────────────────────────────────────────

export const activityApi = {
  globalFeed: (limit = 50, offset = 0) =>
    request<ActivityFeed>("GET", `/activities?limit=${limit}&offset=${offset}`),
  forSandbox: (sandboxId: string, limit = 50, offset = 0) =>
    request<ActivityFeed>(
      "GET",
      `/activities/sandbox/${sandboxId}?limit=${limit}&offset=${offset}`
    ),
  stats: () => request<ActivityStats>("GET", "/activities/stats"),
};

// ── Health API ───────────────────────────────────────────────────────

export const healthApi = {
  check: () =>
    request<{ status: string; version: string }>("GET", "/health"),
};

// ── Template API ─────────────────────────────────────────────────────

export interface SandboxTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  image: string;
  defaultCpu: number;
  defaultMemory: string;
  defaultPorts: Record<string, string>;
  tags: string[];
  recommendedWorkdir: string;
}

export const templateApi = {
  list: () => request<SandboxTemplate[]>("GET", "/templates"),
};
