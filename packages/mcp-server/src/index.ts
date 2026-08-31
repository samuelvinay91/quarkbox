#!/usr/bin/env node

/**
 * QuarkBox MCP Server
 *
 * Enables AI agents (Claude, GPT, Gemini, etc.) to interact with
 * QuarkBox sandboxes through the Model Context Protocol.
 *
 * Tools provided:
 *   - create_sandbox: Create a new sandbox environment
 *   - list_sandboxes: List all sandboxes
 *   - get_sandbox: Get sandbox details by ID
 *   - exec_command: Execute a command inside a sandbox
 *   - start_sandbox: Start a stopped sandbox
 *   - stop_sandbox: Stop a running sandbox
 *   - delete_sandbox: Delete a sandbox
 *   - read_file: Read a file from inside a sandbox
 *   - write_file: Write a file inside a sandbox
 *   - list_files: List files in a sandbox directory
 *   - list_templates: List available sandbox templates
 *
 * Usage:
 *   QUARKBOX_API_URL=http://localhost:3000/api \
 *   QUARKBOX_API_KEY=your_key \
 *   npx @quarkbox/mcp-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Configuration ────────────────────────────────────────────────────

const API_URL = process.env.QUARKBOX_API_URL || "http://localhost:3000/api";
const API_KEY = process.env.QUARKBOX_API_KEY || "";

// ── HTTP Client ──────────────────────────────────────────────────────

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error (${response.status}): ${error}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ── Server Setup ─────────────────────────────────────────────────────

const server = new McpServer({
  name: "quarkbox",
  version: "0.1.0",
});

// ── Tool: create_sandbox ─────────────────────────────────────────────

server.tool(
  "create_sandbox",
  "Create a new isolated cloud sandbox environment. Returns the sandbox ID and connection details. Use this when you need a fresh environment to run code, install packages, or test software.",
  {
    name: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
      .describe(
        "Sandbox name (alphanumeric, hyphens, underscores). Example: 'my-python-env'"
      ),
    image: z
      .string()
      .optional()
      .describe(
        "Container image. Default: ubuntu:22.04. Examples: python:3.12-slim, node:20-alpine, golang:1.22-alpine"
      ),
    description: z
      .string()
      .optional()
      .describe("Human-readable description of the sandbox purpose"),
    cpuLimit: z
      .number()
      .int()
      .min(1)
      .max(16)
      .optional()
      .describe("CPU cores (1-16). Default: 1"),
    memoryLimit: z
      .string()
      .optional()
      .describe("Memory limit. Default: 512m. Examples: 1g, 2g, 4g"),
  },
  async ({ name, image, description, cpuLimit, memoryLimit }) => {
    try {
      const sandbox = await apiRequest<Record<string, unknown>>(
        "POST",
        "/sandboxes",
        {
          name,
          image: image || "ubuntu:22.04",
          description,
          cpuLimit,
          memoryLimit,
        }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Sandbox created successfully!\n\nID: ${sandbox.id}\nName: ${sandbox.name}\nStatus: ${sandbox.status}\nImage: ${sandbox.image}\nIP: ${sandbox.containerIp || "pending"}\n\nYou can now use exec_command to run commands inside this sandbox.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to create sandbox: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: list_sandboxes ─────────────────────────────────────────────

server.tool(
  "list_sandboxes",
  "List all available sandboxes with their current status. Use this to see what environments are running, stopped, or paused.",
  {},
  async () => {
    try {
      const sandboxes = await apiRequest<Array<Record<string, unknown>>>(
        "GET",
        "/sandboxes"
      );

      if (sandboxes.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No sandboxes found. Use create_sandbox to create one.",
            },
          ],
        };
      }

      const list = sandboxes
        .map(
          (s) =>
            `• ${s.name} (${s.id})\n  Status: ${s.status} | Image: ${s.image} | CPU: ${s.cpuLimit} | Memory: ${s.memoryLimit}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${sandboxes.length} sandbox(es):\n\n${list}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to list sandboxes: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: get_sandbox ────────────────────────────────────────────────

server.tool(
  "get_sandbox",
  "Get detailed information about a specific sandbox by its ID.",
  {
    sandboxId: z.string().uuid().describe("The UUID of the sandbox"),
  },
  async ({ sandboxId }) => {
    try {
      const sandbox = await apiRequest<Record<string, unknown>>(
        "GET",
        `/sandboxes/${sandboxId}`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(sandbox, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Sandbox not found: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: exec_command ───────────────────────────────────────────────

server.tool(
  "exec_command",
  "Execute a shell command inside a running sandbox. Returns stdout, stderr, and exit code. Use this to run code, install packages, compile programs, run tests, or any other shell operation.",
  {
    sandboxId: z.string().uuid().describe("The UUID of the sandbox to execute in"),
    command: z
      .string()
      .describe(
        'The shell command to execute. Examples: "python script.py", "npm install express", "ls -la /workspace"'
      ),
    workdir: z
      .string()
      .optional()
      .describe(
        "Working directory for the command. Default: /workspace"
      ),
  },
  async ({ sandboxId, command, workdir }) => {
    try {
      const result = await apiRequest<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>("POST", `/sandboxes/${sandboxId}/exec`, { command, workdir });

      let output = "";
      if (result.stdout) output += `stdout:\n${result.stdout}\n`;
      if (result.stderr) output += `stderr:\n${result.stderr}\n`;
      output += `\nExit code: ${result.exitCode}`;

      return {
        content: [{ type: "text" as const, text: output }],
        isError: result.exitCode !== 0,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Command execution failed: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: start_sandbox ──────────────────────────────────────────────

server.tool(
  "start_sandbox",
  "Start a stopped or paused sandbox.",
  {
    sandboxId: z.string().uuid().describe("The UUID of the sandbox to start"),
  },
  async ({ sandboxId }) => {
    try {
      await apiRequest("POST", `/sandboxes/${sandboxId}/start`);
      return {
        content: [
          { type: "text" as const, text: `✅ Sandbox ${sandboxId} started.` },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to start: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: stop_sandbox ───────────────────────────────────────────────

server.tool(
  "stop_sandbox",
  "Stop a running sandbox. The sandbox state is preserved and can be started again later.",
  {
    sandboxId: z.string().uuid().describe("The UUID of the sandbox to stop"),
  },
  async ({ sandboxId }) => {
    try {
      await apiRequest("POST", `/sandboxes/${sandboxId}/stop`);
      return {
        content: [
          { type: "text" as const, text: `✅ Sandbox ${sandboxId} stopped.` },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to stop: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: delete_sandbox ─────────────────────────────────────────────

server.tool(
  "delete_sandbox",
  "Permanently delete a sandbox and all its data. This action cannot be undone.",
  {
    sandboxId: z
      .string()
      .uuid()
      .describe("The UUID of the sandbox to delete"),
  },
  async ({ sandboxId }) => {
    try {
      await apiRequest("DELETE", `/sandboxes/${sandboxId}`);
      return {
        content: [
          { type: "text" as const, text: `✅ Sandbox ${sandboxId} deleted.` },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to delete: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: read_file ──────────────────────────────────────────────────

server.tool(
  "read_file",
  "Read the contents of a file inside a running sandbox.",
  {
    sandboxId: z.string().uuid().describe("The UUID of the sandbox"),
    path: z
      .string()
      .describe("Absolute path to the file inside the sandbox"),
  },
  async ({ sandboxId, path }) => {
    try {
      const result = await apiRequest<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>("POST", `/sandboxes/${sandboxId}/exec`, {
        command: `cat "${path}"`,
      });

      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Failed to read file: ${result.stderr}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: result.stdout }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to read file: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: write_file ─────────────────────────────────────────────────

server.tool(
  "write_file",
  "Write content to a file inside a running sandbox. Creates the file if it doesn't exist, overwrites if it does. Parent directories are created automatically.",
  {
    sandboxId: z.string().uuid().describe("The UUID of the sandbox"),
    path: z
      .string()
      .describe("Absolute path where the file should be written"),
    content: z.string().describe("The content to write to the file"),
  },
  async ({ sandboxId, path, content }) => {
    try {
      // Escape content for shell and use heredoc
      const escapedContent = content.replace(/'/g, "'\\''");
      const result = await apiRequest<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>("POST", `/sandboxes/${sandboxId}/exec`, {
        command: `mkdir -p "$(dirname "${path}")" && printf '%s' '${escapedContent}' > "${path}"`,
      });

      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Failed to write file: ${result.stderr}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          { type: "text" as const, text: `✅ File written: ${path}` },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to write file: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: list_files ─────────────────────────────────────────────────

server.tool(
  "list_files",
  "List files and directories inside a sandbox at the given path.",
  {
    sandboxId: z.string().uuid().describe("The UUID of the sandbox"),
    path: z
      .string()
      .optional()
      .describe("Directory path. Default: /workspace"),
  },
  async ({ sandboxId, path }) => {
    try {
      const dir = path || "/workspace";
      const result = await apiRequest<{
        exitCode: number;
        stdout: string;
        stderr: string;
      }>("POST", `/sandboxes/${sandboxId}/exec`, {
        command: `ls -la "${dir}"`,
      });

      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Failed to list files: ${result.stderr}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: result.stdout }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `❌ Failed to list files: ${error}` },
        ],
        isError: true,
      };
    }
  }
);

// ── Tool: list_templates ─────────────────────────────────────────────

server.tool(
  "list_templates",
  "List all available golden marketplace sandbox templates with pre-configured developer tooling and agent harnesses.",
  {
    category: z.string().optional().describe("Filter templates by category (e.g. 'AI & Autonomous Agents', 'Web & Full-Stack', 'Systems & Backend')"),
    search: z.string().optional().describe("Search keyword in template names or descriptions"),
  },
  async ({ category, search }) => {
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search) params.set("search", search);
      const queryString = params.toString() ? `?${params.toString()}` : "";

      const templates = await apiRequest<any[]>("GET", `/templates${queryString}`);
      const list = templates
        .map(
          (t) =>
            `📦 ${t.name} (slug: '${t.slug}')\n   Category: ${t.category}\n   Image: ${t.image}\n   Description: ${t.description}\n   Resources: ${t.defaultCpu} vCPU / ${t.defaultMemory} RAM / ${t.defaultDisk} Disk\n   Publisher: ${t.publisher || 'QuarkBox Official'}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Available Golden Marketplace Templates (${templates.length} found):\n\n${list}\n\nUse launch_golden_template with a template's slug to spin up an environment in 1-click.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Failed to list templates from API: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ── Tool: launch_golden_template ───────────────────────────────────────

server.tool(
  "launch_golden_template",
  "1-Click Launch: Deploy a pre-configured golden marketplace template (e.g., 'langgraph-agent-harness', 'nextjs15-fullstack-dev', 'pytorch-cuda-studio', 'fastapi-pgvector-microservice', 'go-microservices-grpc', 'rust-wasm-systems', 'devops-cloud-toolchain', 'claude-code-dev-workspace') into a live sandbox with all dependencies, ports, and tools ready.",
  {
    templateSlug: z.string().describe("Template slug to launch (e.g. 'langgraph-agent-harness', 'nextjs15-fullstack-dev', 'pytorch-cuda-studio')"),
    sandboxName: z.string().describe("Unique name for the launched sandbox"),
    gitRepoUrl: z.string().optional().describe("Optional Git repository URL to clone automatically into the template"),
    gitBranch: z.string().optional().describe("Optional Git branch to checkout"),
    envVars: z.record(z.string()).optional().describe("Custom environment variables to pass to the sandbox"),
  },
  async ({ templateSlug, sandboxName, gitRepoUrl, gitBranch, envVars }) => {
    try {
      const result = await apiRequest<{ sandbox: any; template: any }>(
        "POST",
        `/templates/${templateSlug}/launch`,
        {
          name: sandboxName,
          gitRepoUrl,
          gitBranch,
          envVars,
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `🚀 Golden Template '${result.template?.name || templateSlug}' successfully launched!\n\nSandbox ID: ${result.sandbox.id}\nStatus: ${result.sandbox.status}\nImage: ${result.sandbox.image}\nCPU: ${result.sandbox.cpuLimit} vCPUs | RAM: ${result.sandbox.memoryLimit}\nContainer IP: ${result.sandbox.containerIp || 'Assigned'}\n\nUse exec_command with sandboxId '${result.sandbox.id}' to run commands.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Failed to launch golden template: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ── Tool: get_sandbox_stats ──────────────────────────────────────────

server.tool(
  "get_sandbox_stats",
  "Get real-time container resource usage metrics (CPU core delta %, RAM memory vs cache, network bytes, disk block I/O, PID count) directly from Docker/Linux cgroups.",
  {
    sandboxId: z.string().uuid().describe("The sandbox UUID to inspect"),
  },
  async ({ sandboxId }) => {
    try {
      const stats = await apiRequest<any>("GET", `/sandboxes/${sandboxId}/stats`);
      return {
        content: [
          {
            type: "text" as const,
            text: `📊 Container Resource Metrics for ${sandboxId}:\n\n` +
                  `• CPU Usage: ${stats.cpu?.usagePercent}% (${stats.cpu?.numCpus} cores)\n` +
                  `• Memory Used: ${stats.memory?.usageMb} MB / ${stats.memory?.limitMb} MB (${stats.memory?.usagePercent}%)\n` +
                  `• Page Cache: ${stats.memory?.cache} KB\n` +
                  `• Network RX/TX: ${(stats.network?.rxBytes / 1024).toFixed(1)} KB / ${(stats.network?.txBytes / 1024).toFixed(1)} KB\n` +
                  `• Disk Block Write: ${(stats.blockIO?.writeBytes / 1024 / 1024).toFixed(2)} MB\n` +
                  `• Active PIDs: ${stats.pids}\n` +
                  `• Sampled At: ${stats.readAt}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Failed to get container stats: ${error.message}`,
          },
        ],
      };
    }
// ── Tool: launch_cluster ───────────────────────────────────────────────

server.tool(
  "launch_cluster",
  "Spin up an entire multi-sandbox cluster topology (e.g. Frontend + Backend + Database + AI Worker) connected over an isolated private software-defined network with automatic internal DNS discovery aliases.",
  {
    clusterName: z.string().describe("Name for the cluster mesh (e.g. 'fullstack-rag-app')"),
    nodes: z.array(z.object({
      name: z.string().describe("Name of the service node (e.g. 'frontend', 'backend', 'db', 'agent')"),
      templateSlug: z.string().optional().describe("Optional Golden Template slug (e.g. 'nextjs15-fullstack-dev', 'fastapi-pgvector-microservice')"),
      image: z.string().optional().describe("Docker image (e.g. 'node:20-alpine', 'python:3.12-slim', 'postgres:16-alpine')"),
      networkAlias: z.string().describe("Internal DNS alias hostname within cluster (e.g. 'frontend', 'backend', 'db')"),
      cpuLimit: z.number().optional().describe("vCPU allocation (e.g. 2)"),
      memoryLimit: z.string().optional().describe("RAM allocation (e.g. '1g')"),
      envVars: z.record(z.string()).optional().describe("Node environment variables"),
      ports: z.record(z.string()).optional().describe("Ports mapping"),
    })).describe("List of cluster node specifications to spin up in parallel"),
  },
  async ({ clusterName, nodes }) => {
    try {
      const result = await apiRequest<{ cluster: any; sandboxes: any[] }>(
        "POST",
        "/clusters",
        {
          name: clusterName,
          nodes,
        }
      );
      const nodeSummary = result.sandboxes
        .map((sb) => `  • [${sb.name}] ID: ${sb.id} | Image: ${sb.image} | Status: ${sb.status}`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `🌐 Multi-Sandbox Cluster '${clusterName}' Spun Up Successfully!\n\n` +
                  `Cluster ID: ${result.cluster.id}\n` +
                  `Private Network: ${result.cluster.networkName}\n` +
                  `Status: ${result.cluster.status}\n\n` +
                  `Cluster Nodes:\n${nodeSummary}\n\n` +
                  `All nodes can communicate with each other using their DNS network aliases (e.g. http://backend:8000).`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Failed to launch cluster: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ── Tool: get_cluster ──────────────────────────────────────────────────

server.tool(
  "get_cluster",
  "Get details and node statuses of a multi-sandbox cluster by ID.",
  {
    clusterId: z.string().uuid().describe("Cluster UUID"),
  },
  async ({ clusterId }) => {
    try {
      const result = await apiRequest<{ cluster: any; sandboxes: any[] }>(
        "GET",
        `/clusters/${clusterId}`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Failed to get cluster: ${error.message}`,
          },
        ],
      };
    }
  }
);


// ── Start Server ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `⚛️ QuarkBox MCP Server running (API: ${API_URL})`
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
