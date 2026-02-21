import { useEffect, useRef, useCallback, useState } from "react";
import { useOutletContext } from "react-router";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import type { Project, PtyOutputPayload, PtyExitPayload } from "@/types";
import "@xterm/xterm/css/xterm.css";

function resolveCssColor(varName: string): string {
  const el = document.createElement("div");
  el.style.color = `var(${varName})`;
  el.style.display = "none";
  document.body.appendChild(el);
  const val = getComputedStyle(el).color;
  document.body.removeChild(el);
  return val || "#ffffff";
}

function buildXtermTheme(isDark: boolean) {
  return {
    background: resolveCssColor("--background"),
    foreground: resolveCssColor("--foreground"),
    cursor: resolveCssColor("--primary"),
    cursorAccent: resolveCssColor("--background"),
    selectionBackground: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
    black: isDark ? "#1e1e2e" : "#000000",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#cba6f7",
    cyan: "#89dceb",
    white: isDark ? "#cdd6f4" : "#f5f5f5",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#cba6f7",
    brightCyan: "#89dceb",
    brightWhite: isDark ? "#ffffff" : "#000000",
  };
}

export default function ProjectTerminal() {
  const { project } = useOutletContext<{ project: Project }>();
  const { theme } = useAppStore();
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unlistenRef = useRef<UnlistenFn[]>([]);
  const observerRef = useRef<ResizeObserver | null>(null);
  const unmountedRef = useRef(false);

  const [status, setStatus] = useState<
    "loading" | "ready" | "exited" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const initTerminal = useCallback(
    async (container: HTMLDivElement | null) => {
      if (!container || termRef.current) return;
      containerRef.current = container;
      unmountedRef.current = false;

      const xterm = new XTerm({
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        scrollback: 5000,
        theme: buildXtermTheme(isDark),
      });
      termRef.current = xterm;

      const fit = new FitAddon();
      fitAddonRef.current = fit;
      xterm.loadAddon(fit);
      xterm.open(container);
      fit.fit();

      const { cols, rows } = xterm;
      if (cols < 2 || rows < 2) {
        setErrorMsg(
          "Terminal container has no size — ensure the panel is visible",
        );
        setStatus("error");
        return;
      }

      const unOutput = await listen<PtyOutputPayload>("pty-output", (e) => {
        if (e.payload.pty_id !== ptyIdRef.current) return;
        xterm.write(new Uint8Array(e.payload.data));
      });
      const unExit = await listen<PtyExitPayload>("pty-exit", (e) => {
        if (e.payload.pty_id !== ptyIdRef.current) return;
        xterm.writeln(
          "\r\n\x1b[90m[Process exited — click Restart to launch a new session]\x1b[0m",
        );
        setStatus("exited");
      });
      unlistenRef.current = [unOutput, unExit];

      xterm.onData((data) => {
        const id = ptyIdRef.current;
        if (!id) return;
        api
          .ptyWrite(id, Array.from(new TextEncoder().encode(data)))
          .catch(() => {});
      });

      try {
        const ptyId = await api.ptyCreate(project.path, cols, rows);
        if (unmountedRef.current) {
          api.ptyKill(ptyId).catch(() => {});
          return;
        }
        ptyIdRef.current = ptyId;
        setStatus("ready");
      } catch (err) {
        setErrorMsg(String(err));
        setStatus("error");
        return;
      }

      xterm.onResize(({ cols, rows }) => {
        const id = ptyIdRef.current;
        if (id) api.ptyResize(id, cols, rows).catch(() => {});
      });

      const obs = new ResizeObserver(() => fit.fit());
      obs.observe(container);
      observerRef.current = obs;
    },
    [project.path, isDark],
  );

  // Cleanup on unmount
  useEffect(
    () => () => {
      unmountedRef.current = true;
      unlistenRef.current.forEach((fn) => fn());
      unlistenRef.current = [];
      if (ptyIdRef.current) {
        api.ptyKill(ptyIdRef.current).catch(() => {});
        ptyIdRef.current = null;
      }
      observerRef.current?.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
    },
    [],
  );

  // Theme update without recreating PTY
  useEffect(() => {
    if (termRef.current)
      termRef.current.options.theme = buildXtermTheme(isDark);
  }, [isDark]);

  const handleRestart = () => {
    unlistenRef.current.forEach((fn) => fn());
    unlistenRef.current = [];
    if (ptyIdRef.current) {
      api.ptyKill(ptyIdRef.current).catch(() => {});
      ptyIdRef.current = null;
    }
    observerRef.current?.disconnect();
    termRef.current?.dispose();
    termRef.current = null;
    setStatus("loading");
    setErrorMsg("");
    if (containerRef.current) initTerminal(containerRef.current);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground truncate max-w-64">
            {project.path}
          </span>
          {status === "loading" && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          )}
          {status === "exited" && (
            <span className="text-xs text-muted-foreground">[exited]</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(status === "exited" || status === "error") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleRestart}
            >
              Restart
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Open in external terminal"
            onClick={() =>
              api
                .launchClaude(project.path)
                .then(() => toast.success("Opened in external terminal"))
                .catch((e) => toast.error("Failed", { description: String(e) }))
            }
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 relative overflow-hidden">
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="text-center">
              <p className="text-sm font-medium text-destructive mb-2">
                Failed to start terminal
              </p>
              <p className="text-xs font-mono text-muted-foreground break-all">
                {errorMsg}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleRestart}
              >
                Retry
              </Button>
            </div>
          </div>
        )}
        <div
          ref={(el) => {
            initTerminal(el);
          }}
          className="absolute inset-0 p-1"
          style={{ visibility: status === "error" ? "hidden" : "visible" }}
        />
      </div>
    </div>
  );
}
