import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Terminal,
  Clock,
  MessageSquare,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { useClaudeWatcher } from "@/hooks/useClaudeWatcher";

export default function ClaudeSessions() {
  const navigate = useNavigate();

  const {
    data: sessions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["claude-sessions"],
    queryFn: api.readClaudeSessions,
  });

  useClaudeWatcher("claude-sessions-changed", refetch);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <Terminal className="size-10 text-muted-foreground mb-3" />
        <h3 className="font-medium mb-1">No sessions</h3>
        <p className="text-sm text-muted-foreground">
          Claude Code sessions appear here as you use them
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Sessions</h1>
        <span className="text-xs text-muted-foreground">{sessions.length}</span>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() =>
                navigate(
                  `/claude/sessions/${encodeURIComponent(session.project_key)}/${encodeURIComponent(session.id)}`,
                )
              }
              className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/20 transition-colors group"
            >
              <Terminal className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {session.cwd?.split("/").slice(-2).join("/") ||
                    session.project_key.slice(0, 40)}
                </p>
                {session.cwd && (
                  <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                    {session.cwd}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {session.message_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatRelativeTime(session.last_message_at)}
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
