import { useQuery } from "@tanstack/react-query";
import { Terminal, Clock, MessageSquare, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

export default function ClaudeSessions() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["claude-sessions"],
    queryFn: api.readClaudeSessions,
  });

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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Sessions</h1>
        <span className="text-sm text-muted-foreground">
          {sessions.length} session(s)
        </span>
      </div>

      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/20 transition-colors"
          >
            <Terminal className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session.cwd?.split("/").slice(-2).join("/") ||
                  session.project_key.slice(0, 30)}
              </p>
              {session.cwd && (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {session.cwd}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
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
        ))}
      </div>
    </div>
  );
}
