#!/usr/bin/env node
/**
 * QuarkBox — 4 Real-World Production Agent Use Cases Suite
 *
 * Runs against the LIVE Docker Engine on Port 3001:
 *  1. Autonomous Data Science & ML Model Training Pipeline
 *  2. FastAPI Microservice Deployment + Live Reverse Port Proxying
 *  3. Autonomous Git Repo Ingestion & Build-Test Workflow
 *  4. Stateful Snapshot Checkpointing & 1-Click Branching / Forking
 */

import { setTimeout as sleep } from "timers/promises";

const API = "http://localhost:3001/api";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m",
};
const banner = (s) => console.log(`\n${C.bold}${C.cyan}╔═══════════════════════════════════════════════════════════════╗\n║  ${s.padEnd(61)}║\n╚═══════════════════════════════════════════════════════════════╝${C.reset}\n`);
const ok = (s) => console.log(`  ${C.green}✔${C.reset} ${s}`);
const info = (s) => console.log(`  ${C.blue}ℹ${C.reset} ${s}`);

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} (${res.status}): ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

async function exec(sandboxId, command, label) {
  const t0 = Date.now();
  const res = await api("POST", `/sandboxes/${sandboxId}/exec`, { command });
  const dur = Date.now() - t0;
  if (res.exitCode !== 0) {
    throw new Error(`Command '${command}' failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);
  }
  ok(`${label} (${dur}ms)`);
  return res;
}

async function run() {
  banner("QUARKBOX: 4 REAL-WORLD AGENT PRODUCTION USE CASES");

  // ── USE CASE 1: Autonomous ML Training & Model Export ───────────────────
  banner("USE CASE 1: AI Agent Autonomous Machine Learning Pipeline");
  info("Provisioning dedicated Python 3.12 ML Sandbox...");
  const mlBox = await api("POST", "/sandboxes", {
    name: `ml-agent-${Date.now() % 10000}`,
    image: "python:3.12-slim",
    cpuLimit: 4,
    memoryLimit: "1g",
  });
  ok(`Provisioned Real Docker Container ID: ${mlBox.containerId.slice(0, 12)} (IP: ${mlBox.containerIp})`);

  info("Installing ML dependencies (requests, numpy, scikit-learn)...");
  await exec(mlBox.id, "pip install --quiet numpy scikit-learn", "Installed numpy + scikit-learn");

  info("Agent executing dataset generation & Random Forest model training inside container...");
  const trainScript = `
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import make_classification
import pickle, json

X, y = make_classification(n_samples=1000, n_features=10, n_informative=5, random_state=42)
clf = RandomForestClassifier(n_estimators=50, random_state=42)
clf.fit(X, y)
acc = clf.score(X, y)

with open('/tmp/model.pkl', 'wb') as f:
    pickle.dump(clf, f)

report = {'model': 'RandomForestClassifier', 'accuracy': round(acc, 4), 'samples': 1000, 'features': 10}
with open('/tmp/training_report.json', 'w') as f:
    json.dump(report, f, indent=2)

print(json.dumps(report))
`;
  const b64Train = Buffer.from(trainScript).toString("base64");
  await exec(mlBox.id, `echo "${b64Train}" | base64 -d > /tmp/train.py && python3 /tmp/train.py`, "Trained Random Forest Classifier & Saved Weights");

  info("Verifying serialized model file on container overlay filesystem...");
  const lsRes = await exec(mlBox.id, "ls -lh /tmp/model.pkl /tmp/training_report.json", "Verified /tmp/model.pkl existence");
  console.log(`     ${C.dim}${lsRes.stdout.trim()}${C.reset}`);

  const mlStats = await api("GET", `/sandboxes/${mlBox.id}/stats`);
  ok(`Cgroup Telemetry: CPU ${mlStats.cpu.usagePercent}% | Real RAM ${mlStats.memory.usageMb}MB | Disk Write ${(mlStats.blockIO.writeBytes/1024/1024).toFixed(1)}MB`);

  // ── USE CASE 2: FastAPI Microservice with Live Reverse Port Proxy ────────
  banner("USE CASE 2: Microservice Deployment + Live Reverse Port Proxy");
  info("Creating FastAPI web server inside container on port 8000...");
  await exec(mlBox.id, "pip install --quiet fastapi uvicorn", "Installed FastAPI & Uvicorn");

  const serverCode = `
from fastapi import FastAPI
import uvicorn, socket, time

app = FastAPI()

@app.get('/api/health')
def health():
  return {'status': 'healthy', 'hostname': socket.gethostname(), 'timestamp': time.time()}

@app.get('/api/agent-task')
def task():
  return {'task': 'autonomous-code-generation', 'status': 'completed', 'engine': 'QuarkBox'}

if __name__ == '__main__':
  uvicorn.run(app, host='0.0.0.0', port=8000)
`;
  const b64Server = Buffer.from(serverCode).toString("base64");
  await exec(
    mlBox.id,
    `echo "${b64Server}" | base64 -d > /tmp/server.py`,
    "Wrote FastAPI web app to /tmp/server.py"
  );

  info("Starting FastAPI daemon on port 8000 inside sandbox...");
  await exec(mlBox.id, "python3 /tmp/server.py > /tmp/server.log 2>&1 &", "FastAPI Daemon Launched");
  await sleep(1500);

  info(`Testing QuarkBox Reverse Port Proxy forwarding: GET /api/proxy/${mlBox.id}/8000/api/health ...`);
  const proxyRes = await fetch(`${API}/proxy/${mlBox.id}/8000/api/health`);
  if (!proxyRes.ok) throw new Error(`Proxy failed with ${proxyRes.status}: ${await proxyRes.text()}`);
  const proxyData = await proxyRes.json();
  ok(`Proxy Succeeded! Received from internal container: ${JSON.stringify(proxyData)}`);

  const proxyRes2 = await fetch(`${API}/proxy/${mlBox.id}/8000/api/agent-task`);
  const proxyData2 = await proxyRes2.json();
  ok(`Proxy Route /api/agent-task Succeeded: ${JSON.stringify(proxyData2)}`);

  // ── USE CASE 3: Autonomous Git Ingestion & Automated Testing ─────────────
  banner("USE CASE 3: Autonomous Git Repository Ingestion & Test Workflow");
  info("Injecting Git repository directly into sandbox...");
  const gitRes = await api("POST", `/context/sandbox/${mlBox.id}/git`, {
    repoUrl: "https://github.com/octocat/Hello-World.git",
    targetDir: "/tmp/hello-world",
  });
  ok(`Git Ingested (${gitRes.stdout.trim() || 'cloned'})`);

  const gitCheck = await exec(mlBox.id, "cd /tmp/hello-world && git log -1 --oneline", "Inspected Git Commit Log");
  console.log(`     ${C.dim}Latest Commit: ${gitCheck.stdout.trim()}${C.reset}`);

  // ── USE CASE 4: Stateful Snapshot Checkpoint & 1-Click Fork ──────────────
  banner("USE CASE 4: Persistent State Snapshot & 1-Click Sandbox Forking");
  info("Taking persistent binary snapshot (docker commit) of ML + FastAPI container...");
  const snapshot = await api("POST", `/snapshots/sandbox/${mlBox.id}`, {
    name: "ml-fastapi-checkpoint",
    description: "Checkpoint containing trained scikit-learn model and running FastAPI app",
  });
  ok(`Created Snapshot ID: ${snapshot.id} | Image: ${snapshot.snapshotImage} (${Math.round(snapshot.sizeBytes / (1024*1024))}MB)`);

  info("1-Click Forking a brand-new Sandbox from the Snapshot image...");
  const fork = await api("POST", "/sandboxes", {
    name: `forked-clone-${Date.now() % 10000}`,
    image: snapshot.snapshotImage,
  });
  ok(`Forked Cloned Sandbox ID: ${fork.id} (Status: ${fork.status})`);

  info("Verifying cloned container preserved the parent's trained model and files...");
  const cloneVerify = await exec(fork.id, "cat /tmp/training_report.json", "Cloned Container Read Parent State");
  console.log(`     ${C.dim}Read from Cloned Sandbox: ${cloneVerify.stdout.trim()}${C.reset}`);

  // ── Cleanup ─────────────────────────────────────────────────────────────
  banner("CLEANUP: Tearing down test containers");
  await api("POST", `/sandboxes/${mlBox.id}/stop`);
  await fetch(`${API}/sandboxes/${mlBox.id}`, { method: "DELETE" });
  await api("POST", `/sandboxes/${fork.id}/stop`);
  await fetch(`${API}/sandboxes/${fork.id}`, { method: "DELETE" });
  ok(`All production test sandboxes cleanly destroyed.`);

  banner("🎉 ALL 4 REAL-WORLD AGENT PRODUCTION USE CASES COMPLETED 100%!");
}

run().catch((err) => {
  console.error(`\n❌ Error in Real Use Cases Test:`, err);
  process.exit(1);
});
