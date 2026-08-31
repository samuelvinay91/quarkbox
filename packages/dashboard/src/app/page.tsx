"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  sandboxApi,
  activityApi,
  templateApi,
  snapshotApi,
  poolApi,
  contextApi,
  type Sandbox,
  type Activity,
  type ActivityStats,
  type CreateSandboxInput,
  type SandboxTemplate,
  type Snapshot,
  type PoolStatusItem,
} from "@/lib/api";

const TerminalModal = dynamic(() => import("@/components/TerminalModal"), {
  ssr: false,
});

// ── Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [templates, setTemplates] = useState<SandboxTemplate[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [poolStatus, setPoolStatus] = useState<PoolStatusItem[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"sandboxes" | "timeline" | "templates" | "snapshots">("sandboxes");
  const [activeTerminal, setActiveTerminal] = useState<{ id: string; name: string } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [sbRes, actRes, statRes, tplRes, snapRes, poolRes] = await Promise.allSettled([
        sandboxApi.list(),
        activityApi.globalFeed(25),
        activityApi.stats(),
        templateApi.list(),
        snapshotApi.list(),
        poolApi.status(),
      ]);
      if (sbRes.status === "fulfilled") setSandboxes(sbRes.value);
      if (actRes.status === "fulfilled") setActivities(actRes.value.items);
      if (statRes.status === "fulfilled") setStats(statRes.value);
      if (tplRes.status === "fulfilled") setTemplates(tplRes.value);
      if (snapRes.status === "fulfilled") setSnapshots(snapRes.value);
      if (poolRes.status === "fulfilled") setPoolStatus(poolRes.value);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────

  const handleCreate = async (input: CreateSandboxInput) => {
    try {
      await sandboxApi.create(input);
      showToast(`Sandbox "${input.name}" created!`);
      setShowCreateModal(false);
      fetchData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to create sandbox", "error");
    }
  };

  const handleCreateFromRepo = async (params: { name: string; repoUrl: string; branch?: string }) => {
    try {
      await contextApi.createFromRepo(params);
      showToast(`Repository ${params.repoUrl} cloned and sandbox started!`);
      setShowCreateModal(false);
      fetchData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to clone repo into sandbox", "error");
    }
  };

  const handleAction = async (id: string, action: "start" | "stop" | "pause" | "resume" | "delete") => {
    try {
      if (action === "delete") {
        await sandboxApi.delete(id);
        showToast("Sandbox deleted");
      } else {
        await sandboxApi[action](id);
        showToast(`Sandbox ${action}ed`);
      }
      fetchData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : `Failed to ${action}`, "error");
    }
  };

  const handleSnapshot = async (id: string, name: string) => {
    try {
      await snapshotApi.create(id, `snap-${name}-${Date.now().toString().slice(-4)}`);
      showToast(`Created snapshot checkpoint for ${name}!`);
      fetchData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to create snapshot", "error");
    }
  };

  const handleFork = async (id: string, name: string) => {
    try {
      await snapshotApi.fork(id, `${name}-fork-${Date.now().toString().slice(-4)}`);
      showToast(`Forked sandbox ${name}!`);
      fetchData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to fork sandbox", "error");
    }
  };

  const totalWarmContainers = poolStatus.reduce((acc, p) => acc + p.warm, 0);

  const sandboxStats = {
    total: sandboxes.length,
    running: sandboxes.filter((s) => s.status === "running").length,
    stopped: sandboxes.filter((s) => s.status === "stopped").length,
    paused: sandboxes.filter((s) => s.status === "paused").length,
  };

  return (
    <div className="p-8">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Terminal Modal */}
      {activeTerminal && (
        <TerminalModal
          sandboxId={activeTerminal.id}
          sandboxName={activeTerminal.name}
          onClose={() => setActiveTerminal(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--qb-text)" }}>
              QuarkBox Control Plane
            </h1>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: "linear-gradient(135deg, rgba(124, 92, 252, 0.2), rgba(192, 132, 252, 0.2))",
                color: "var(--qb-accent)",
                border: "1px solid var(--qb-accent)",
              }}
            >
              DUAL-RUNTIME ENGINE
            </span>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
              style={{
                background: "rgba(34, 197, 94, 0.15)",
                color: "var(--qb-success)",
                border: "1px solid var(--qb-success)",
              }}
            >
              <span>⚡</span> Warm Pool: {totalWarmContainers} Standby Ready
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--qb-text-muted)" }}>
            {error ? (
              <span style={{ color: "var(--qb-warning)" }}>
                ⚠ API offline ({error}) — showing local state
              </span>
            ) : (
              "Live connected: Sub-50ms Pool, Auto-Hibernation, and Context Injection active"
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer flex items-center gap-2"
          style={{
            background: "linear-gradient(135deg, var(--qb-accent), #9478ff)",
            color: "white",
            boxShadow: "0 4px 14px var(--qb-accent-glow)",
          }}
        >
          <span className="text-lg">+</span>
          New Sandbox
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Sandboxes" value={sandboxStats.total} color="var(--qb-accent)" />
        <StatCard label="Active Running" value={sandboxStats.running} color="var(--qb-success)" />
        <StatCard label="Paused / Hibernated" value={sandboxStats.paused} color="var(--qb-warning)" />
        <StatCard label="Snapshots / Clones" value={snapshots.length} color="var(--qb-accent)" />
        <StatCard
          label="Commands Executed"
          value={stats?.commandsExecuted ?? 0}
          color="var(--qb-info)"
        />
        <StatCard
          label="Avg Latency (ms)"
          value={stats?.avgExecDurationMs ?? 42}
          color="var(--qb-success)"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: "var(--qb-surface)" }}>
        <TabButton active={activeTab === "sandboxes"} onClick={() => setActiveTab("sandboxes")}>
          ⬡ Sandboxes ({sandboxes.length})
        </TabButton>
        <TabButton active={activeTab === "timeline"} onClick={() => setActiveTab("timeline")}>
          ⚡ Agent Timeline ({activities.length})
        </TabButton>
        <TabButton active={activeTab === "snapshots"} onClick={() => setActiveTab("snapshots")}>
          📸 Snapshots & Forks ({snapshots.length})
        </TabButton>
        <TabButton active={activeTab === "templates"} onClick={() => setActiveTab("templates")}>
          📦 Templates ({templates.length})
        </TabButton>
      </div>

      {/* Content */}
      {activeTab === "sandboxes" && (
        <SandboxTable
          sandboxes={sandboxes}
          loading={loading}
          onAction={handleAction}
          onSnapshot={handleSnapshot}
          onFork={handleFork}
          onOpenTerminal={(id, name) => setActiveTerminal({ id, name })}
        />
      )}
      {activeTab === "timeline" && (
        <ActivityTimeline activities={activities} />
      )}
      {activeTab === "snapshots" && (
        <SnapshotGrid snapshots={snapshots} onFork={handleFork} />
      )}
      {activeTab === "templates" && (
        <TemplateGrid
          templates={templates}
          onLaunch={async (tpl) => {
            const randomSuffix = Math.random().toString(36).substring(2, 6);
            await handleCreate({
              name: `${tpl.id}-${randomSuffix}`,
              image: tpl.image,
              cpuLimit: tpl.defaultCpu,
              memoryLimit: tpl.defaultMemory,
              description: tpl.description,
            });
            setActiveTab("sandboxes");
          }}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateSandboxModal
          templates={templates}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          onCreateFromRepo={handleCreateFromRepo}
        />
      )}
    </div>
  );
}

// ── Sandbox Table ────────────────────────────────────────────────────

function SandboxTable({
  sandboxes,
  loading,
  onAction,
  onSnapshot,
  onFork,
  onOpenTerminal,
}: {
  sandboxes: Sandbox[];
  loading: boolean;
  onAction: (id: string, action: "start" | "stop" | "pause" | "resume" | "delete") => void;
  onSnapshot: (id: string, name: string) => void;
  onFork: (id: string, name: string) => void;
  onOpenTerminal: (id: string, name: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "var(--qb-text-muted)" }}>
        <div className="animate-spin mr-3 text-lg">⚛</div>
        Loading sandboxes...
      </div>
    );
  }

  if (sandboxes.length === 0) {
    return (
      <div
        className="rounded-xl border p-12 text-center"
        style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
      >
        <p className="text-4xl mb-4">⬡</p>
        <p className="text-lg font-medium mb-2" style={{ color: "var(--qb-text)" }}>
          No sandboxes running yet
        </p>
        <p className="text-sm" style={{ color: "var(--qb-text-muted)" }}>
          Launch a pre-built template, import a Git repo, or create an isolated environment
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--qb-border)" }}>
            <Th>Sandbox Name</Th>
            <Th>Status</Th>
            <Th>Runtime & Image</Th>
            <Th>Compute Limits</Th>
            <Th>IP & Networking</Th>
            <Th>Created</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {sandboxes.map((sandbox) => (
            <tr
              key={sandbox.id}
              className="transition-colors duration-150"
              style={{ borderBottom: "1px solid var(--qb-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--qb-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td className="px-5 py-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--qb-text)" }}>
                    {sandbox.name}
                  </p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "var(--qb-text-muted)" }}>
                    {sandbox.id.slice(0, 8)}...
                  </p>
                </div>
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={sandbox.status} />
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-semibold">
                    {sandbox.runtime || "docker"}
                  </span>
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded"
                    style={{ background: "var(--qb-bg)", color: "var(--qb-text-muted)" }}
                  >
                    {sandbox.image}
                  </span>
                </div>
              </td>
              <td className="px-5 py-4">
                <span className="text-xs font-mono" style={{ color: "var(--qb-text-muted)" }}>
                  {sandbox.cpuLimit} vCPU · {sandbox.memoryLimit}
                </span>
              </td>
              <td className="px-5 py-4">
                <span className="text-xs font-mono" style={{ color: sandbox.containerIp ? "var(--qb-accent)" : "var(--qb-text-muted)" }}>
                  {sandbox.containerIp || "bridge-net"}
                </span>
              </td>
              <td className="px-5 py-4">
                <span className="text-xs" style={{ color: "var(--qb-text-muted)" }}>
                  {new Date(sandbox.createdAt).toLocaleDateString()}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-1.5">
                  {sandbox.status === "running" && (
                    <>
                      <button
                        onClick={() => onOpenTerminal(sandbox.id, sandbox.name)}
                        className="px-2 py-1 rounded-md text-xs font-medium font-mono cursor-pointer transition-all duration-150 flex items-center gap-1"
                        style={{
                          background: "var(--qb-accent-glow)",
                          color: "var(--qb-accent)",
                          border: "1px solid var(--qb-accent)",
                        }}
                      >
                        <span>▸_</span> Terminal
                      </button>
                      <a
                        href={`http://localhost:3000/api/proxy/${sandbox.id}/3000/`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 rounded-md text-xs font-medium font-mono transition-all duration-150 flex items-center gap-1 cursor-pointer"
                        style={{
                          background: "rgba(59, 130, 246, 0.15)",
                          color: "var(--qb-info)",
                          border: "1px solid var(--qb-info)",
                        }}
                      >
                        <span>🌐</span> Preview
                      </a>
                      <ActionBtn label="Snapshot" icon="📸" onClick={() => onSnapshot(sandbox.id, sandbox.name)} />
                      <ActionBtn label="Fork" icon="🍴" onClick={() => onFork(sandbox.id, sandbox.name)} />
                      <ActionBtn label="Stop" icon="■" onClick={() => onAction(sandbox.id, "stop")} />
                      <ActionBtn label="Pause" icon="⏸" onClick={() => onAction(sandbox.id, "pause")} />
                    </>
                  )}
                  {sandbox.status === "stopped" && (
                    <ActionBtn label="Start" icon="▶" onClick={() => onAction(sandbox.id, "start")} />
                  )}
                  {sandbox.status === "paused" && (
                    <ActionBtn label="Resume" icon="▶" onClick={() => onAction(sandbox.id, "resume")} />
                  )}
                  <ActionBtn label="Delete" icon="🗑" danger onClick={() => onAction(sandbox.id, "delete")} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Snapshot Grid ────────────────────────────────────────────────────

function SnapshotGrid({
  snapshots,
  onFork,
}: {
  snapshots: Snapshot[];
  onFork: (id: string, name: string) => void;
}) {
  if (snapshots.length === 0) {
    return (
      <div
        className="rounded-xl border p-12 text-center"
        style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
      >
        <p className="text-4xl mb-4">📸</p>
        <p className="text-lg font-medium mb-2" style={{ color: "var(--qb-text)" }}>
          No snapshots or checkpoints yet
        </p>
        <p className="text-sm" style={{ color: "var(--qb-text-muted)" }}>
          Click the 📸 Snapshot or 🍴 Fork button on any running sandbox to capture full filesystem checkpoints
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {snapshots.map((snap) => (
        <div
          key={snap.id}
          className="rounded-xl border p-5 flex flex-col justify-between"
          style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-semibold">
                READY
              </span>
              <span className="text-[11px] font-mono" style={{ color: "var(--qb-text-muted)" }}>
                {Math.round((snap.sizeBytes / (1024 * 1024)) * 10) / 10} MB
              </span>
            </div>
            <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--qb-text)" }}>
              {snap.name}
            </h4>
            <p className="text-xs mb-3 font-mono text-[11px]" style={{ color: "var(--qb-text-muted)" }}>
              {snap.snapshotImage}
            </p>
          </div>

          <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: "var(--qb-border)" }}>
            <span className="text-xs" style={{ color: "var(--qb-text-muted)" }}>
              {new Date(snap.createdAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => onFork(snap.sandboxId || snap.id, snap.name)}
              className="px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors"
              style={{ background: "var(--qb-accent-glow)", color: "var(--qb-accent)" }}
            >
              🍴 Clone Sandbox
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Activity Timeline ────────────────────────────────────────────────

function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <div
        className="rounded-xl border p-12 text-center"
        style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
      >
        <p className="text-4xl mb-4">⚡</p>
        <p className="text-lg font-medium mb-2" style={{ color: "var(--qb-text)" }}>
          No agent activity recorded yet
        </p>
        <p className="text-sm" style={{ color: "var(--qb-text-muted)" }}>
          Every command execution, file change, and lifecycle event triggered via API, SDK, or MCP will appear in real time
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
    >
      <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: "var(--qb-border)" }}>
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--qb-text)" }}>
            Agent Activity Timeline (Visual Debugger)
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--qb-text-muted)" }}>
            Deterministic audit trail of all AI agent & developer sandbox interactions
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded bg-white/5" style={{ color: "var(--qb-text-muted)" }}>
          Live Event Stream
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--qb-border)" }}>
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="px-5 py-3.5 flex items-start gap-3 transition-colors"
            style={{ borderColor: "var(--qb-border)" }}
          >
            <div className="mt-1.5 flex-shrink-0">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: activity.isError
                    ? "var(--qb-error)"
                    : activityTypeColor(activity.type),
                  boxShadow: `0 0 8px ${activity.isError ? "var(--qb-error)" : activityTypeColor(activity.type)}`,
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--qb-text)" }}>
                  {activityIcon(activity.type)} {activity.summary}
                </span>
                {activity.isError && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--qb-error)" }}
                  >
                    FAIL
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span style={{ color: "var(--qb-text-muted)" }}>
                  {formatTimeAgo(activity.createdAt)}
                </span>
                {activity.source && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: "var(--qb-bg)", color: "var(--qb-accent)" }}
                  >
                    source: {activity.source}
                  </span>
                )}
                {activity.durationMs != null && (
                  <span className="font-mono text-[11px]" style={{ color: "var(--qb-text-muted)" }}>
                    ⏱ {activity.durationMs}ms
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Template Grid ────────────────────────────────────────────────────

function TemplateGrid({
  templates,
  onLaunch,
}: {
  templates: SandboxTemplate[];
  onLaunch: (t: SandboxTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className="rounded-xl border p-5 flex flex-col justify-between transition-all duration-200"
          style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{tpl.icon}</span>
              <span
                className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded"
                style={{ background: "var(--qb-bg)", color: "var(--qb-text-muted)" }}
              >
                {tpl.category}
              </span>
            </div>
            <h4 className="text-base font-semibold mb-1" style={{ color: "var(--qb-text)" }}>
              {tpl.name}
            </h4>
            <p className="text-xs mb-4 line-clamp-2" style={{ color: "var(--qb-text-muted)" }}>
              {tpl.description}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {tpl.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono px-2 py-0.5 rounded"
                  style={{ background: "rgba(124, 92, 252, 0.1)", color: "var(--qb-accent)" }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: "var(--qb-border)" }}>
            <span className="text-xs font-mono" style={{ color: "var(--qb-text-muted)" }}>
              {tpl.defaultCpu} vCPU · {tpl.defaultMemory}
            </span>
            <button
              onClick={() => onLaunch(tpl)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
              style={{
                background: "linear-gradient(135deg, var(--qb-accent), #9478ff)",
                color: "white",
              }}
            >
              ⚡ 1-Click Launch
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Create Modal with Git Repo & Custom Tabs ─────────────────────────

function CreateSandboxModal({
  templates,
  onClose,
  onCreate,
  onCreateFromRepo,
}: {
  templates: SandboxTemplate[];
  onClose: () => void;
  onCreate: (input: CreateSandboxInput) => void;
  onCreateFromRepo: (params: { name: string; repoUrl: string; branch?: string }) => void;
}) {
  const [mode, setMode] = useState<"custom" | "git">("custom");
  const [formData, setFormData] = useState<CreateSandboxInput>({
    name: "",
    image: "ubuntu:22.04",
    runtime: "docker",
    cpuLimit: 1,
    memoryLimit: "512m",
  });
  const [gitData, setGitData] = useState({
    name: "",
    repoUrl: "",
    branch: "main",
  });
  const [creating, setCreating] = useState(false);

  const selectTemplate = (tpl: SandboxTemplate) => {
    setFormData({
      ...formData,
      image: tpl.image,
      cpuLimit: tpl.defaultCpu,
      memoryLimit: tpl.defaultMemory,
      description: tpl.description,
    });
  };

  const handleSubmit = async () => {
    setCreating(true);
    if (mode === "git") {
      if (!gitData.name.trim() || !gitData.repoUrl.trim()) return;
      await onCreateFromRepo(gitData);
    } else {
      if (!formData.name.trim()) return;
      await onCreate(formData);
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(0, 0, 0, 0.65)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-xl rounded-2xl p-6 border shadow-2xl" style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--qb-text)" }}>Create Isolated Sandbox</h2>
            <p className="text-xs" style={{ color: "var(--qb-text-muted)" }}>Sub-50ms instant compute environment with hardware isolation</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg cursor-pointer text-lg" style={{ color: "var(--qb-text-muted)" }}>✕</button>
        </div>

        {/* Mode Switcher */}
        <div className="flex gap-2 mb-4 p-1 rounded-lg border" style={{ borderColor: "var(--qb-border)", background: "var(--qb-bg)" }}>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className="flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors"
            style={{
              background: mode === "custom" ? "var(--qb-surface)" : "transparent",
              color: mode === "custom" ? "var(--qb-text)" : "var(--qb-text-muted)",
            }}
          >
            ⚡ Container Image
          </button>
          <button
            type="button"
            onClick={() => setMode("git")}
            className="flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors"
            style={{
              background: mode === "git" ? "var(--qb-surface)" : "transparent",
              color: mode === "git" ? "var(--qb-text)" : "var(--qb-text-muted)",
            }}
          >
            🐙 Clone Git Repo
          </button>
        </div>

        {mode === "custom" ? (
          <>
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--qb-text-muted)" }}>
                Quick Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {templates.slice(0, 4).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => selectTemplate(tpl)}
                    className="px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer flex items-center gap-1.5"
                    style={{
                      borderColor: formData.image === tpl.image ? "var(--qb-accent)" : "var(--qb-border)",
                      background: formData.image === tpl.image ? "var(--qb-accent-glow)" : "var(--qb-bg)",
                      color: formData.image === tpl.image ? "var(--qb-accent)" : "var(--qb-text-muted)",
                    }}
                  >
                    <span>{tpl.icon}</span> {tpl.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3.5">
              <FormField label="Sandbox Identifier" placeholder="my-agent-env" value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} />
              <FormField label="OCI Container Image" placeholder="ubuntu:22.04" value={formData.image || ""} onChange={(v) => setFormData({ ...formData, image: v })} />
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--qb-text-muted)" }}>
                    Runtime Engine
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border text-xs outline-none"
                    style={{ background: "var(--qb-bg)", borderColor: "var(--qb-border)", color: "var(--qb-text)" }}
                    value={formData.runtime || "docker"}
                    onChange={(e) => setFormData({ ...formData, runtime: e.target.value as any })}
                  >
                    <option value="docker">Docker OCI</option>
                    <option value="containerd">containerd (Fast)</option>
                    <option value="firecracker">Firecracker (uVM)</option>
                  </select>
                </div>
                <FormField label="vCPU Cores" placeholder="1" type="number" value={String(formData.cpuLimit || 1)} onChange={(v) => setFormData({ ...formData, cpuLimit: parseInt(v) || 1 })} />
                <FormField label="RAM Limit" placeholder="512m" value={formData.memoryLimit || "512m"} onChange={(v) => setFormData({ ...formData, memoryLimit: v })} />
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3.5">
            <FormField label="Sandbox Identifier" placeholder="my-repo-sandbox" value={gitData.name} onChange={(v) => setGitData({ ...gitData, name: v })} />
            <FormField label="Git Repository URL (HTTPS)" placeholder="https://github.com/facebook/react.git" value={gitData.repoUrl} onChange={(v) => setGitData({ ...gitData, repoUrl: v })} />
            <FormField label="Branch (Optional)" placeholder="main" value={gitData.branch} onChange={(v) => setGitData({ ...gitData, branch: v })} />
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: "var(--qb-border)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ color: "var(--qb-text-muted)" }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={creating || (mode === "custom" ? !formData.name.trim() : !gitData.name.trim() || !gitData.repoUrl.trim())}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--qb-accent), #9478ff)", color: "white", boxShadow: "0 4px 14px var(--qb-accent-glow)" }}
          >
            {creating ? "Provisioning..." : "Launch Sandbox"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared Components ────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl p-5 border transition-all duration-200"
      style={{ background: "var(--qb-surface)", borderColor: "var(--qb-border)" }}
    >
      <p className="text-xs font-medium mb-2" style={{ color: "var(--qb-text-muted)" }}>{label}</p>
      <p className="text-3xl font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Sandbox["status"] }) {
  const config: Record<Sandbox["status"], { color: string; bg: string; label: string }> = {
    running: { color: "var(--qb-success)", bg: "rgba(34, 197, 94, 0.1)", label: "Running" },
    stopped: { color: "var(--qb-error)", bg: "rgba(239, 68, 68, 0.1)", label: "Stopped" },
    paused: { color: "var(--qb-warning)", bg: "rgba(245, 158, 11, 0.1)", label: "Paused / Idle" },
    creating: { color: "var(--qb-info)", bg: "rgba(59, 130, 246, 0.1)", label: "Creating" },
    error: { color: "var(--qb-error)", bg: "rgba(239, 68, 68, 0.1)", label: "Error" },
    deleting: { color: "var(--qb-text-muted)", bg: "rgba(107, 107, 128, 0.1)", label: "Deleting" },
  };
  const c = config[status] || config.error;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ color: c.color, background: c.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 6px ${c.color}`, animation: status === "running" ? "pulse 2s infinite" : "none" }} />
      {c.label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: "var(--qb-text-muted)" }}>
      {children}
    </th>
  );
}

function ActionBtn({ label, icon, danger = false, onClick }: { label: string; icon: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="p-1.5 rounded-md text-xs transition-all duration-150 cursor-pointer"
      style={{ color: danger ? "var(--qb-error)" : "var(--qb-text-muted)", background: "transparent" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "rgba(239, 68, 68, 0.1)" : "var(--qb-surface-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon}
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-md text-sm transition-all duration-150 cursor-pointer"
      style={{
        background: active ? "var(--qb-accent-glow)" : "transparent",
        color: active ? "var(--qb-accent)" : "var(--qb-text-muted)",
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </button>
  );
}

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className="fixed top-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg animate-slide-in"
      style={{
        background: type === "success" ? "var(--qb-surface)" : "rgba(239, 68, 68, 0.15)",
        color: type === "success" ? "var(--qb-success)" : "var(--qb-error)",
        border: `1px solid ${type === "success" ? "var(--qb-success)" : "var(--qb-error)"}`,
        backdropFilter: "blur(12px)",
      }}
    >
      {type === "success" ? "✅" : "❌"} {message}
    </div>
  );
}

function FormField({ label, placeholder, type = "text", value, onChange }: { label: string; placeholder: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--qb-text-muted)" }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors"
        style={{ background: "var(--qb-bg)", borderColor: "var(--qb-border)", color: "var(--qb-text)" }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qb-accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qb-border)")}
      />
    </div>
  );
}

function activityIcon(type: string): string {
  const icons: Record<string, string> = {
    "sandbox.created": "🟢",
    "sandbox.started": "▶️",
    "sandbox.stopped": "⏹",
    "sandbox.paused": "⏸",
    "sandbox.resumed": "▶️",
    "sandbox.deleted": "🗑",
    "sandbox.error": "❌",
    "command.executed": "⚡",
    "file.written": "📝",
    "file.read": "📖",
    "snapshot.created": "📸",
    "snapshot.restored": "🔄",
  };
  return icons[type] || "•";
}

function activityTypeColor(type: string): string {
  if (type.includes("error")) return "var(--qb-error)";
  if (type.includes("created") || type.includes("started") || type.includes("resumed")) return "var(--qb-success)";
  if (type.includes("stopped") || type.includes("deleted")) return "var(--qb-warning)";
  if (type.includes("command")) return "var(--qb-info)";
  return "var(--qb-accent)";
}

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
