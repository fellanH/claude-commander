import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  Terminal,
  User,
  Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { SessionTurn, SessionToolCall } from "@/types";

// ─── Tool call collapsible block ───────────────────────────────────────────

function ToolCallBlock({ tool }: { tool: SessionToolCall }) {
  const [open, setOpen] = useState(false);

  let inputPretty: string;
  try {
    inputPretty = JSON.stringify(JSON.parse(tool.input), null, 2);
  } catch {
    inputPretty = tool.input;
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-md border border-border bg-muted/40 text-xs mt-2 overflow-hidden"
    >
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none hover:bg-muted/60 transition-colors">
        {open ? (
          <ChevronDown className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground shrink-0" />
        )}
        <Wrench className="size-3 text-amber-500 shrink-0" />
        <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
          {tool.name}
        </span>
        <span className="text-muted-foreground ml-auto">{tool.id}</span>
      </summary>
      <div className="border-t border-border px-3 py-2 space-y-2">
        <div>
          <p className="text-muted-foreground mb-1 font-medium uppercase tracking-wider text-[10px]">
            Input
          </p>
          <pre className="whitespace-pre-wrap break-all text-foreground/80 overflow-x-auto">
            {inputPretty}
          </pre>
        </div>
        {tool.output && (
          <div>
            <p className="text-muted-foreground mb-1 font-medium uppercase tracking-wider text-[10px]">
              Output
            </p>
            <pre className="whitespace-pre-wrap break-all text-foreground/80 overflow-x-auto">
              {tool.output}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

// ─── Single turn bubble ────────────────────────────────────────────────────

function TurnBubble({
  turn,
  highlight,
}: {
  turn: SessionTurn;
  highlight: string;
}) {
  const isUser = turn.role === "user";

  const highlightedText = useMemo(() => {
    if (!highlight || !turn.content) return turn.content;
    return turn.content;
  }, [turn.content, highlight]);

  const hasContent = turn.content.trim().length > 0;
  const hasTools = turn.tool_calls.length > 0;

  if (!hasContent && !hasTools) return null;

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      data-role={turn.role}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        {isUser ? (
          <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="size-4 text-primary" />
          </div>
        ) : (
          <div className="size-7 rounded-full bg-muted flex items-center justify-center">
            <Bot className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[78%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border"
        }`}
      >
        {hasContent && (
          <>
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">
                {highlightedText}
              </p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                <ReactMarkdown>{highlightedText}</ReactMarkdown>
              </div>
            )}
          </>
        )}

        {/* Tool calls */}
        {hasTools && (
          <div className={hasContent ? "mt-2" : ""}>
            {turn.tool_calls.map((tool) => (
              <ToolCallBlock key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p
          className={`text-xs mt-2 ${
            isUser ? "text-primary-foreground/60" : "text-muted-foreground"
          }`}
        >
          {formatRelativeTime(turn.timestamp)}
        </p>
      </div>
    </div>
  );
}

// ─── SessionDetail page ────────────────────────────────────────────────────

export default function SessionDetail() {
  const { projectKey, sessionId } = useParams<{
    projectKey: string;
    sessionId: string;
  }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["session-detail", projectKey, sessionId],
    queryFn: () => api.readClaudeSession(projectKey!, sessionId!),
    enabled: !!projectKey && !!sessionId,
  });

  const visibleTurns = useMemo(() => {
    if (!data) return [];
    const kw = filter.trim().toLowerCase();
    if (!kw) return data.turns;
    return data.turns.filter((t) => {
      if (t.content.toLowerCase().includes(kw)) return true;
      if (
        t.tool_calls.some(
          (tc) =>
            tc.name.toLowerCase().includes(kw) ||
            tc.input.toLowerCase().includes(kw),
        )
      )
        return true;
      return false;
    });
  }, [data, filter]);

  const isTruncated = data && data.total_count > data.turns.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border shrink-0 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-md hover:bg-accent/40 transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate font-mono">
            {sessionId}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Terminal className="size-3" />
              {projectKey}
            </span>
            {data && (
              <span className="flex items-center gap-1">
                <MessageSquare className="size-3" />
                {data.turns.length}
                {isTruncated && (
                  <span className="text-amber-500">
                    {" "}
                    / {data.total_count} total
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-5 py-2 border-b border-border shrink-0">
        <input
          type="text"
          placeholder="Filter by keyword..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full text-sm bg-muted/40 border border-border rounded-md px-3 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {filter && (
          <p className="text-xs text-muted-foreground mt-1">
            {visibleTurns.length} matching turn
            {visibleTurns.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Turn list */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageSquare className="size-8 mb-2" />
            <p className="text-sm">Failed to load session</p>
          </div>
        )}

        {!isLoading && !isError && visibleTurns.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageSquare className="size-8 mb-2" />
            <p className="text-sm">
              {filter
                ? "No turns match your filter"
                : "No turns in this session"}
            </p>
          </div>
        )}

        {!isLoading && !isError && visibleTurns.length > 0 && (
          <div className="space-y-4">
            {isTruncated && !filter && (
              <div className="text-xs text-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                Showing first 500 of {data!.total_count} lines. Large session
                file is truncated.
              </div>
            )}
            {visibleTurns.map((turn) => (
              <TurnBubble
                key={turn.uuid || `${turn.role}-${turn.timestamp}`}
                turn={turn}
                highlight={filter}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
