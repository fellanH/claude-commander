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

type GroupedResults = {
  label: string;
  items: ResultItem[];
}[];

const KIND_LABELS: Record<ResultItem["kind"], string> = {
  project: "Projects",
  planning: "Planning Items",
  plan: "Plans",
  task: "Tasks",
};

const KIND_ORDER: ResultItem["kind"][] = [
  "project",
  "planning",
  "plan",
  "task",
];

function groupResults(results: ResultItem[]): GroupedResults {
  const byKind: Partial<Record<ResultItem["kind"], ResultItem[]>> = {};
  for (const r of results) {
    if (!byKind[r.kind]) byKind[r.kind] = [];
    byKind[r.kind]!.push(r);
  }
  return KIND_ORDER.filter((k) => (byKind[k]?.length ?? 0) > 0).map((k) => ({
    label: KIND_LABELS[k],
    items: byKind[k]!,
  }));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // Debounce: 150ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
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

  // Scroll active item into view
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Focus trap: Tab cycles within modal
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const focusable = listRef.current?.querySelectorAll<HTMLElement>(
      "button, input, [tabindex]:not([tabindex='-1'])",
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const isSearching = debouncedQuery.length >= 2;

  const flatResults: ResultItem[] =
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

  const groups = groupResults(flatResults);

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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatResults[activeIndex]) {
      handleSelect(flatResults[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (!open) return null;

  // Build a flat index map so we can track activeIndex per group item
  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      role="presentation"
      onClick={() => setOpen(false)}
      onKeyDown={handleModalKeyDown}
    >
      <div
        ref={listRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="fixed left-1/2 top-1/3 -translate-x-1/2 w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {isFetching ? (
            <Loader2
              className="size-4 text-muted-foreground shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Search
              className="size-4 text-muted-foreground shrink-0"
              aria-hidden="true"
            />
          )}
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={flatResults.length > 0}
            aria-controls="cmd-palette-listbox"
            aria-autocomplete="list"
            aria-label="Search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search projects, tasks, plans..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          id="cmd-palette-listbox"
          role="listbox"
          aria-label="Search results"
          className="max-h-80 overflow-y-auto py-2"
        >
          {flatResults.length === 0 ? (
            <p
              role="status"
              className="text-sm text-muted-foreground text-center py-6"
            >
              {isSearching && !isFetching ? "No results" : "Searching…"}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label}>
                {/* Group heading */}
                <div className="px-4 pt-3 pb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
                {group.items.map((result) => {
                  const thisIdx = flatIdx++;
                  const isActive = thisIdx === activeIndex;
                  return (
                    <ResultRow
                      key={`${result.kind}-${result.id}`}
                      ref={isActive ? activeItemRef : undefined}
                      result={result}
                      isActive={isActive}
                      flatIndex={thisIdx}
                      onSelect={() => handleSelect(result)}
                      onHover={() => setActiveIndex(thisIdx)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

import { forwardRef } from "react";

const ResultRow = forwardRef<
  HTMLButtonElement,
  {
    result: ResultItem;
    isActive: boolean;
    flatIndex: number;
    onSelect: () => void;
    onHover: () => void;
  }
>(function ResultRow({ result, isActive, flatIndex, onSelect, onHover }, ref) {
  const base = `w-full text-left flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
    isActive ? "bg-accent" : "hover:bg-accent/50"
  }`;

  const sharedProps = {
    ref,
    className: base,
    role: "option" as const,
    "aria-selected": isActive,
    id: `cmd-result-${flatIndex}`,
    onClick: onSelect,
    onMouseEnter: onHover,
  };

  if (result.kind === "project") {
    return (
      <button {...sharedProps}>
        <FolderOpen
          className="size-4 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{result.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {result.path.replace(/^\/Users\/[^/]+/, "~")}
          </p>
        </div>
      </button>
    );
  }

  if (result.kind === "planning") {
    return (
      <button {...sharedProps}>
        <ListTodo
          className="size-4 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
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
      <button {...sharedProps}>
        <FileText
          className="size-4 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{result.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {result.preview}
          </p>
        </div>
      </button>
    );
  }

  // task
  return (
    <button {...sharedProps}>
      <CheckSquare
        className="size-4 text-muted-foreground shrink-0"
        aria-hidden="true"
      />
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
});
