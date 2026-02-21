import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  FolderOpen,
  FileText,
  ListTodo,
  CheckSquare,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

type ResultItem =
  | { kind: "project"; id: string; name: string; path: string }
  | {
      kind: "planning";
      id: string;
      subject: string;
      project_id: string | null;
      project_name: string;
      status: string;
    }
  | { kind: "plan"; id: string; title: string; preview: string }
  | {
      kind: "task";
      id: string;
      subject: string;
      team_name: string | null;
      status: string;
    };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce: 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Projects for empty-state browse
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
    staleTime: 60_000,
  });

  // Rust global search — only fires when debouncedQuery >= 2 chars
  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: () => api.globalSearch(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5_000,
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
      setDebouncedQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const isSearching = debouncedQuery.length >= 2;

  const results: ResultItem[] =
    isSearching && searchResults
      ? [
          ...searchResults.projects.map((p) => ({
            kind: "project" as const,
            id: p.id,
            name: p.name,
            path: p.path,
          })),
          ...searchResults.planning_items.map((i) => ({
            kind: "planning" as const,
            id: i.id,
            subject: i.subject,
            project_id: i.project_id,
            project_name: i.project_name,
            status: i.status,
          })),
          ...searchResults.plans.map((p) => ({
            kind: "plan" as const,
            id: p.id,
            title: p.title,
            preview: p.preview,
          })),
          ...searchResults.tasks.map((t) => ({
            kind: "task" as const,
            id: t.id,
            subject: t.subject,
            team_name: t.team_name,
            status: t.status,
          })),
        ]
      : (projects ?? []).slice(0, 8).map((p) => ({
          kind: "project" as const,
          id: p.id,
          name: p.name,
          path: p.path,
        }));

  const handleSelect = useCallback(
    (result: ResultItem) => {
      setOpen(false);
      switch (result.kind) {
        case "project":
          navigate(`/projects/${result.id}`);
          break;
        case "planning":
          navigate(
            result.project_id
              ? `/projects/${result.project_id}`
              : "/claude/tasks",
          );
          break;
        case "plan":
          navigate("/claude/plans");
          break;
        case "task":
          navigate("/claude/tasks");
          break;
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
          {isFetching ? (
            <Loader2 className="size-4 text-muted-foreground shrink-0 animate-spin" />
          ) : (
            <Search className="size-4 text-muted-foreground shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, tasks, plans..."
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
              {isSearching && !isFetching ? "No results" : "Searching…"}
            </p>
          ) : (
            results.map((result, i) => (
              <ResultRow
                key={`${result.kind}-${result.id}`}
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
    return (
      <button className={base} onClick={onSelect} onMouseEnter={onHover}>
        <FolderOpen className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{result.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {result.path.replace(/^\/Users\/[^/]+/, "~")}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">Project</span>
      </button>
    );
  }

  if (result.kind === "planning") {
    return (
      <button className={base} onClick={onSelect} onMouseEnter={onHover}>
        <ListTodo className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{result.subject}</p>
          <p className="text-xs text-muted-foreground truncate">
            {result.project_name}
          </p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {result.status}
        </span>
      </button>
    );
  }

  if (result.kind === "plan") {
    return (
      <button className={base} onClick={onSelect} onMouseEnter={onHover}>
        <FileText className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{result.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {result.preview}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">Plan</span>
      </button>
    );
  }

  // task
  return (
    <button className={base} onClick={onSelect} onMouseEnter={onHover}>
      <CheckSquare className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{result.subject}</p>
        {result.team_name && (
          <p className="text-xs text-muted-foreground truncate">
            {result.team_name}
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
        {result.status}
      </span>
    </button>
  );
}
