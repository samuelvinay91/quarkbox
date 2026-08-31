"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

interface TerminalModalProps {
  sandboxId: string;
  sandboxName: string;
  onClose: () => void;
}

export default function TerminalModal({
  sandboxId,
  sandboxName,
  onClose,
}: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let term: any = null;
    let fitAddon: any = null;

    async function initTerminal() {
      if (!terminalRef.current) return;

      // Dynamically import xterm to prevent SSR errors
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      await import("@xterm/xterm/css/xterm.css");

      term = new Terminal({
        cursorBlink: true,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
        fontSize: 13,
        lineHeight: 1.25,
        theme: {
          background: "#0d0d14",
          foreground: "#e4e4ef",
          cursor: "#7c5cfc",
          selectionBackground: "rgba(124, 92, 252, 0.3)",
          black: "#1e1e2e",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#f59e0b",
          blue: "#3b82f6",
          magenta: "#c084fc",
          cyan: "#06b6d4",
          white: "#e4e4ef",
          brightBlack: "#4b4b60",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#fde047",
          brightBlue: "#60a5fa",
          brightMagenta: "#d8b4fe",
          brightCyan: "#22d3ee",
          brightWhite: "#ffffff",
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      terminalRef.current.innerHTML = "";
      term.open(terminalRef.current);
      fitAddon.fit();

      term.writeln("\x1b[1;35m⚛ QuarkBox Cloud Terminal\x1b[0m");
      term.writeln(`\x1b[90mConnecting to sandbox: ${sandboxName} (${sandboxId.slice(0, 8)})... \x1b[0m\r\n`);

      // Socket.io connection to Terminal Gateway
      const socketUrl =
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api")
          .replace("/api", "") || "http://localhost:3000";

      const socket = io(`${socketUrl}/terminal`, {
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setStatus("connecting");
        socket.emit("attach", { sandboxId, shell: "/bin/bash" });
      });

      socket.on("ready", () => {
        setStatus("connected");
        term.writeln("\x1b[32m✔ Interactive session attached!\x1b[0m\r\n");
        term.focus();
        if (fitAddon) {
          socket.emit("resize", { cols: term.cols, rows: term.rows });
        }
      });

      socket.on("output", (data: string) => {
        term.write(data);
      });

      socket.on("exit", () => {
        setStatus("disconnected");
        term.writeln("\r\n\x1b[33mSession terminated by host.\x1b[0m");
      });

      socket.on("error", (err: string) => {
        setStatus("error");
        setErrorMsg(err);
        term.writeln(`\r\n\x1b[31mError: ${err}\x1b[0m`);
      });

      term.onData((data: string) => {
        if (socket.connected) {
          socket.emit("input", { input: data });
        }
      });

      const handleResize = () => {
        if (fitAddon && term) {
          fitAddon.fit();
          if (socket.connected) {
            socket.emit("resize", { cols: term.cols, rows: term.rows });
          }
        }
      };

      window.addEventListener("resize", handleResize);
    }

    initTerminal();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (term) {
        term.dispose();
      }
    };
  }, [sandboxId, sandboxName]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="w-full max-w-5xl h-[80vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl animate-scale-in"
        style={{
          background: "#0d0d14",
          borderColor: "var(--qb-border)",
        }}
      >
        {/* Terminal Header */}
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between"
          style={{ background: "#12121c", borderColor: "var(--qb-border)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
            </div>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <span className="text-xs font-mono font-medium" style={{ color: "var(--qb-text)" }}>
              {sandboxName} <span style={{ color: "var(--qb-text-muted)" }}>({sandboxId.slice(0, 8)})</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-mono"
              style={{
                background:
                  status === "connected"
                    ? "rgba(34, 197, 94, 0.15)"
                    : status === "connecting"
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(239, 68, 68, 0.15)",
                color:
                  status === "connected"
                    ? "var(--qb-success)"
                    : status === "connecting"
                    ? "var(--qb-warning)"
                    : "var(--qb-error)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    status === "connected"
                      ? "var(--qb-success)"
                      : status === "connecting"
                      ? "var(--qb-warning)"
                      : "var(--qb-error)",
                }}
              />
              {status.toUpperCase()}
            </span>

            <button
              onClick={onClose}
              className="text-sm px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              style={{
                color: "var(--qb-text-muted)",
                background: "rgba(255, 255, 255, 0.05)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--qb-text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--qb-text-muted)")}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Terminal Canvas */}
        <div className="flex-1 p-3 overflow-hidden" ref={terminalRef} />

        {/* Footer */}
        <div
          className="px-5 py-2 border-t flex items-center justify-between text-[11px] font-mono"
          style={{ background: "#0a0a10", borderColor: "var(--qb-border)", color: "var(--qb-text-muted)" }}
        >
          <span>PTY Stream: Docker /bin/bash (xterm-256color)</span>
          <span>Tip: Press Ctrl+C to interrupt commands</span>
        </div>
      </div>
    </div>
  );
}
