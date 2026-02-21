import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, FolderOpen, Terminal, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Project, ClaudeSession, ClaudePlan } from "@/types";

type ResultItem =
  | { kind: "project"; item: Project }
  | { kind: "session"; item: ClaudeSession }
  | { kind: "plan"; item: ClaudePlan };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
    staleTime: 60_000,
  });

  const { data: sessions } = useQuery({
    queryKey: ["claude-sessions"],
    queryFn: api.readClaudeSessions,
    staleTime: 30_000,
  });

  const { data: plans } = useQuery({
    queryKey: ["claude-plans"],
    queryFn: api.listClaudePlans,
    staleTime: 30_000,
  });

  // Global Cmd+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus + reset on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const q = query.toLowerCase();

  const results: ResultItem[] = [];

  projects?.forEach((p) => {
    if (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q)
    ) {
      results.push({ kind: "project", item: p });
    }
  });

  sessions?.forEach((s) => {
    const label = s.cwd?.split("/").slice(-2).join("/") ?? s.project_key;
    if (
      !q ||
      label.toLowerCase().includes(q) ||
      s.cwd?.toLowerCase().includes(q)
    ) {
      results.push({ kind: "session", item: s });
    }
  });

  plans?.forEach((p) => {
    if (!q || p.title.toLowerCase().includes(q)) {
      results.push({ kind: "plan", item: p });
    }
  });

  const handleSelect = useCallback(
    (result: ResultItem) => {
      setOpen(false);
      if (result.kind === "project") {
        navigate(`/projects/${result.item.id}`);
      } else if (result.kind === "session") {
        navigate("/claude/sessions");
      } else {
        navigate("/claude/plans");
      }
    },
    [navigate],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={() => setOpen(false)}
    >
      <div
        className="fixed left-1/2 top-1/3 -translate-x-1/2 w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, sessions, plans..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No results
            </p>
          ) : (
            results.map((result, i) => (
              <ResultRow
                key={`${result.kind}-${result.item.id}`}
                result={result}
                isActive={i === activeIndex}
                onSelect={() => handleSelect(result)}
                onHover={() => setActiveIndex(i)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  result,
  isActive,
  onSelect,
  onHover,
}: {
  result: ResultItem;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const base = `w-full text-left flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
    isActive ? "bg-accent" : "hover:bg-accent/50"
  }`;

  if (result.kind === "project") {
    const p = result.item;
    return (
      <button className={base} onClick={onSelect} onMouseEnter={onHover}>
        <FolderOpen className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{p.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {p.path.replace(/^\/Users\/[^/]+/, "~")}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">Project</span>
      </button>
    );
  }

  if (result.kind === "session") {
    const s = result.item;
    const label = s.cwd?.split("/").slice(-2).join("/") ?? s.project_key;
    return (
      <button className={base} onClick={onSelect} onMouseEnter={onHover}>
        <Terminal className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{label}</p>
          {s.cwd && (
            <p className="text-xs text-muted-foreground font-mono truncate">
              {s.cwd}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">Session</span>
      </button>
    );
  }

  const p = result.item;
  return (
    <button className={base} onClick={onSelect} onMouseEnter={onHover}>
      <FileText className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{p.title}</p>
        <p className="text-xs text-muted-foreground truncate">{p.preview}</p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">Plan</span>
    </button>
  );
}
