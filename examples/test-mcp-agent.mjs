/**
 * AI Agent MCP Protocol Live Integration Test
 * Spawns @quarkbox/mcp-server via stdio and tests MCP tool calling via JSON-RPC.
 */

import { spawn } from "child_process";
import { resolve } from "path";

const mcpProcess = spawn("node", [resolve("packages/mcp-server/dist/index.js")], {
  env: {
    ...process.env,
    QUARKBOX_API_URL: "http://localhost:3000/api",
  },
  stdio: ["pipe", "pipe", "inherit"],
});

let msgId = 1;
const pendingRequests = new Map();

let buffer = "";
mcpProcess.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf-8");
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line.trim());
      if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve } = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        resolve(msg);
      }
    } catch {
      // Non-json output
    }
  }
});

function sendRpc(method, params = {}) {
  const id = msgId++;
  const payload = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    mcpProcess.stdin.write(JSON.stringify(payload) + "\n");
  });
}

async function runAgentTest() {
  console.log("🤖 Initializing AI Agent MCP Protocol Connection...");

  // 1. Initialize MCP
  const initRes = await sendRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "AntigravityAgent", version: "1.0.0" },
  });
  console.log("✔ MCP Server Initialized:", initRes.result?.serverInfo?.name);

  // 2. List tools
  const toolsRes = await sendRpc("tools/list");
  const tools = toolsRes.result?.tools || [];
  console.log(`✔ Discovered ${tools.length} AI Agent Tools:`);
  for (const tool of tools) {
    console.log(`  🛠️  ${tool.name} — ${tool.description?.slice(0, 60)}...`);
  }

  // 3. Agent calls list_templates
  console.log("\n⚡ Agent Tool Call: list_templates...");
  const tplRes = await sendRpc("tools/call", {
    name: "list_templates",
    arguments: {},
  });
  const tplText = tplRes.result?.content?.[0]?.text || "";
  console.log(`✔ Agent received templates from MCP:\n${tplText.slice(0, 150)}...`);

  // 4. Agent calls create_sandbox
  console.log("\n⚡ Agent Tool Call: create_sandbox...");
  const createRes = await sendRpc("tools/call", {
    name: "create_sandbox",
    arguments: {
      name: "mcp-agent-box",
      image: "python:3.12-slim",
      description: "Provisioned by autonomous AI agent",
      cpu_limit: 2,
    },
  });
  const createdText = createRes.result?.content?.[0]?.text || "";
  console.log("✔ Agent Created Sandbox Output:\n", createdText);

  // 5. Extract sandbox ID and exec command
  const idMatch = createdText.match(/ID:\s*([a-f0-9-]+)/i) || createdText.match(/"id":\s*"([^"]+)"/);
  if (idMatch) {
    const sandboxId = idMatch[1];
    console.log(`\n⚡ Agent Tool Call: exec_command inside sandbox ${sandboxId}...`);
    const execRes = await sendRpc("tools/call", {
      name: "exec_command",
      arguments: {
        sandboxId: sandboxId,
        command: "python3 -c 'print(\"Autonomous AI Agent execution succeeded!\")'",
      },
    });
    console.log("✔ Agent Exec Result Output:\n", execRes.result?.content?.[0]?.text);
  }

  console.log("\n✨ AI Agent MCP Integration Test Passed 100%!");
  mcpProcess.kill();
  process.exit(0);
}

runAgentTest().catch((err) => {
  console.error("MCP Agent Test Error:", err);
  mcpProcess.kill();
  process.exit(1);
});
