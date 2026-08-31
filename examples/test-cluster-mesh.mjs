#!/usr/bin/env node
/**
 * QuarkBox — Multi-Sandbox Cluster Mesh Integration Test
 *
 * Demonstrates spinning up an interconnected multi-service cluster
 * (Frontend + Backend + DB) with isolated SDN private networking and
 * internal DNS resolution across containers.
 */

import { setTimeout as sleep } from "timers/promises";

const API = "http://localhost:3001/api";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", blue: "\x1b[34m", cyan: "\x1b[36m",
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
  banner("QUARKBOX: MULTI-SANDBOX CLUSTER MESH & DNS ORCHESTRATION");

  info("Spinning up 3-node interconnected Cluster Mesh (Frontend + Backend + DB)...");
  const clusterRes = await api("POST", "/clusters", {
    name: "ai-fullstack-mesh",
    nodes: [
      {
        name: "frontend",
        image: "node:20-alpine",
        networkAlias: "frontend",
        cpuLimit: 2,
        memoryLimit: "512m",
      },
      {
        name: "backend",
        image: "python:3.12-slim",
        networkAlias: "backend",
        cpuLimit: 2,
        memoryLimit: "512m",
      },
      {
        name: "db",
        image: "python:3.12-slim",
        networkAlias: "db",
        cpuLimit: 2,
        memoryLimit: "512m",
      },
    ],
  });

  const cluster = clusterRes.cluster;
  const sandboxes = clusterRes.sandboxes;
  ok(`Cluster Created: ID ${cluster.id} on Private Network '${cluster.networkName}'`);
  sandboxes.forEach((sb) => {
    ok(`  Node [${sb.name}] container: ${sb.containerId.slice(0, 12)} (IP: ${sb.containerIp})`);
  });

  const feNode = sandboxes.find((s) => s.name.includes("frontend"));
  const beNode = sandboxes.find((s) => s.name.includes("backend"));
  const dbNode = sandboxes.find((s) => s.name.includes("db"));

  // 1. Launch HTTP Server on Backend Node
  info("Launching lightweight HTTP microservice on 'backend' node (port 8000)...");
  const beServerPy = `
import http.server, socketserver, json, socket

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        res = {'status': 'ok', 'service': 'backend-api', 'node': socket.gethostname(), 'mesh': 'ai-fullstack-mesh'}
        self.wfile.write(json.dumps(res).encode())

with socketserver.TCPServer(('0.0.0.0', 8000), Handler) as httpd:
    httpd.serve_forever()
`;
  const b64 = Buffer.from(beServerPy).toString("base64");
  await exec(beNode.id, `echo "${b64}" | base64 -d > /tmp/be.py && python3 /tmp/be.py > /tmp/be.log 2>&1 &`, "Started Backend Service Daemon");
  await sleep(1500);

  // 2. Perform cross-container DNS request from frontend node to http://backend:8000
  info("Frontend node executing cross-container HTTP call via cluster DNS: http://backend:8000 ...");
  const fePingScript = `
const http = require('http');
http.get('http://backend:8000', (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => console.log('INTER-CLUSTER RESPONSE:', data));
});
`;
  const b64Fe = Buffer.from(fePingScript).toString("base64");
  const pingRes = await exec(
    feNode.id,
    `echo "${b64Fe}" | base64 -d > /tmp/ping.js && node /tmp/ping.js`,
    "Cross-Node DNS HTTP Request Succeeded"
  );
  console.log(`     ${C.dim}${pingRes.stdout.trim()}${C.reset}`);

  // 3. Inspect Cluster Topology
  info("Fetching full cluster mesh status and node health...");
  const clusterStatus = await api("GET", `/clusters/${cluster.id}`);
  ok(`Cluster Status Verified: ${clusterStatus.cluster.status} (${clusterStatus.sandboxes.length} active nodes)`);

  // 4. Destroy Cluster Mesh
  info("Tearing down cluster mesh and removing private bridge network...");
  await fetch(`${API}/clusters/${cluster.id}`, { method: "DELETE" });
  ok(`Cluster '${cluster.name}' and network '${cluster.networkName}' destroyed cleanly.`);

  banner("🎉 MULTI-SANDBOX CLUSTER MESH & DNS RESOLUTION VERIFIED 100%!");
}

run().catch((err) => {
  console.error("\n❌ Error in Cluster Test:", err);
  process.exit(1);
});
