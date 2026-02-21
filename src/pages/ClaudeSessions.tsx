import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Terminal,
  Clock,
  MessageSquare,
  Loader2,
  User,
  Bot,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { ClaudeSession } from "@/types";

export default function ClaudeSessions() {
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(
    null,
  );

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["claude-sessions"],
    queryFn: api.readClaudeSessions,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: [
      "session-messages",
      selectedSession?.project_key,
      selectedSession?.id,
    ],
    queryFn: () =>
      api.readSessionMessages(
        selectedSession!.project_key,
        selectedSession!.id,
      ),
    enabled: !!selectedSession,
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
    <div className="flex h-full overflow-hidden">
      {/* Left panel — session list */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h1 className="text-sm font-semibold">Sessions</h1>
          <span className="text-xs text-muted-foreground">
            {sessions.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  selectedSession?.id === session.id
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-card hover:bg-accent/20"
                }`}
              >
                <Terminal className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {session.cwd?.split("/").slice(-2).join("/") ||
                      session.project_key.slice(0, 30)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
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
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — message viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSession ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="size-10 mb-3" />
            <p className="text-sm">Select a session to view messages</p>
          </div>
        ) : (
          <>
            {/* Session header */}
            <div className="px-5 py-3 border-b border-border shrink-0">
              <p className="text-sm font-semibold truncate">
                {selectedSession.cwd?.split("/").slice(-2).join("/") ||
                  selectedSession.project_key.slice(0, 40)}
              </p>
              {selectedSession.cwd && (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {selectedSession.cwd}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {messages?.length ?? selectedSession.message_count} messages ·{" "}
                {formatRelativeTime(selectedSession.last_message_at)}
              </p>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages && messages.length > 0 ? (
                messages.map((msg) => (
                  <div
                    key={msg.uuid || `${msg.role}-${msg.timestamp}`}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div className="shrink-0 mt-1">
                      {msg.role === "user" ? (
                        <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="size-4 text-primary" />
                        </div>
                      ) : (
                        <div className="size-7 rounded-full bg-muted flex items-center justify-center">
                          <Bot className="size-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div
                      className={`max-w-[75%] rounded-lg px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                      <p
                        className={`text-xs mt-2 ${
                          msg.role === "user"
                            ? "text-primary-foreground/60"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatRelativeTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No readable messages in this session
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
