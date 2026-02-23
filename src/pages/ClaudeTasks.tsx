import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Clock, Link2, Loader2, RefreshCw } from "lucide-react";
import { useClaudeWatcher } from "@/hooks/useClaudeWatcher";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkGithubIssueDialog } from "@/components/LinkGithubIssueDialog";
import type { ClaudeTask, TaskGithubLink } from "@/types";

const statusConfig: Record<
  string,
  {
    label: string;
    variant:
      | "default"
      | "info"
      | "success"
      | "warning"
      | "secondary"
      | "outline";
  }
> = {
  pending: { label: "Pending", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "info" },
  completed: { label: "Done", variant: "success" },
  deleted: { label: "Deleted", variant: "outline" },
};

/** Dot colour indicating cached GitHub issue state. */
function IssueStateDot({ state }: { state: "open" | "closed" | null }) {
  if (!state) return null;
  return (
    <span
      className={`inline-block size-1.5 rounded-full shrink-0 ${
        state === "open" ? "bg-green-500" : "bg-purple-500"
      }`}
      title={state === "open" ? "Open" : "Closed"}
    />
  );
}

// ─── Close-issue prompt ──────────────────────────────────────────────────────

interface ClosePromptEntry {
  task: ClaudeTask & { team_id: string };
  link: TaskGithubLink;
}

function CloseIssuePrompt({
  entry,
  onConfirm,
  onDismiss,
  isPending,
}: {
  entry: ClosePromptEntry;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-3">
        <h2 className="font-semibold text-sm">Close GitHub issue?</h2>
        <p className="text-sm text-muted-foreground">
          Task{" "}
          <span className="text-foreground font-medium">
            "{entry.task.subject}"
          </span>{" "}
          is complete. Close linked issue{" "}
          <span className="text-primary font-mono">
            #{entry.link.github_issue_number}
          </span>
          {entry.link.github_repo && (
            <span className="text-muted-foreground">
              {" "}
              in {entry.link.github_repo}
            </span>
          )}
          ?
        </p>
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onDismiss}
            disabled={isPending}
          >
            Skip
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-3 mr-1.5 animate-spin" />
            ) : null}
            Close Issue
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClaudeTasks() {
  const queryClient = useQueryClient();

  const {
    data: taskFiles,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["claude-tasks"],
    queryFn: api.readClaudeTasks,
    staleTime: 30_000,
  });

  const { data: links, refetch: refetchLinks } = useQuery({
    queryKey: ["task-github-links"],
    queryFn: api.getTaskGithubLinks,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  useClaudeWatcher("claude-tasks-changed", refetch);

  // Build a lookup map: `${team_id}:${task_id}` → TaskGithubLink
  const linkMap: Record<string, TaskGithubLink> = {};
  for (const link of links ?? []) {
    linkMap[`${link.team_id}:${link.task_id}`] = link;
  }

  // ── Completion-transition detection ──────────────────────────────────────
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const [closePromptQueue, setClosePromptQueue] = useState<ClosePromptEntry[]>(
    [],
  );

  useEffect(() => {
    if (!taskFiles || !settings?.github_close_prompt) return;

    const newStatuses = new Map<string, string>();
    const newPrompts: ClosePromptEntry[] = [];

    for (const tf of taskFiles) {
      for (const task of tf.tasks) {
        const key = `${tf.team_id}:${task.id}`;
        newStatuses.set(key, task.status);

        const prev = prevStatusesRef.current.get(key);
        const justCompleted =
          prev !== undefined &&
          prev !== "completed" &&
          task.status === "completed";

        if (justCompleted) {
          const link = linkMap[key];
          // Only prompt when the issue is not already closed.
          if (link && link.github_issue_state !== "closed") {
            newPrompts.push({ task: { ...task, team_id: tf.team_id }, link });
          }
        }
      }
    }

    prevStatusesRef.current = newStatuses;

    if (newPrompts.length > 0) {
      setClosePromptQueue((q) => [...q, ...newPrompts]);
    }
  }, [taskFiles, settings?.github_close_prompt]);

  // ── Refresh issue states ─────────────────────────────────────────────────
  const lastRefreshRef = useRef(0);
  const MIN_REFRESH_INTERVAL_MS = 60_000;

  const refreshStatesMutation = useMutation({
    mutationFn: api.fetchIssueStates,
    onSuccess: (updated) => {
      queryClient.setQueryData(["task-github-links"], updated);
      lastRefreshRef.current = Date.now();
    },
  });

  // Auto-refresh on window focus (at most once per minute).
  useEffect(() => {
    const handleFocus = () => {
      if (Date.now() - lastRefreshRef.current > MIN_REFRESH_INTERVAL_MS) {
        refreshStatesMutation.mutate();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // ── Close issue mutation ─────────────────────────────────────────────────
  const closeIssueMutation = useMutation({
    mutationFn: (entry: ClosePromptEntry) => {
      const { link } = entry;
      return api.closeGithubIssue(
        link.task_id,
        link.team_id,
        link.github_repo!,
        link.github_issue_number!,
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<TaskGithubLink[]>(["task-github-links"], (old) =>
        old?.map((l) =>
          l.task_id === updated.task_id && l.team_id === updated.team_id
            ? updated
            : l,
        ),
      );
      setClosePromptQueue((q) => q.slice(1));
    },
    onError: () => {
      setClosePromptQueue((q) => q.slice(1));
    },
  });

  const dismissClosePrompt = () => setClosePromptQueue((q) => q.slice(1));
  const currentPrompt = closePromptQueue[0];

  // ── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allTasks =
    taskFiles?.flatMap((tf) =>
      tf.tasks.map((t) => ({ ...t, team_id: tf.team_id })),
    ) ?? [];

  const groups: Record<string, typeof allTasks> = {
    in_progress: allTasks.filter((t) => t.status === "in_progress"),
    pending: allTasks.filter((t) => t.status === "pending"),
    completed: allTasks.filter((t) => t.status === "completed"),
  };

  if (allTasks.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <CheckSquare className="size-10 text-muted-foreground mb-3" />
        <h3 className="font-medium mb-1">No tasks</h3>
        <p className="text-sm text-muted-foreground">
          Tasks appear here when Claude Code is running
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Tasks</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {allTasks.length} total
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => refreshStatesMutation.mutate()}
              disabled={refreshStatesMutation.isPending}
              title="Refresh GitHub issue states"
            >
              <RefreshCw
                className={`size-3.5 ${refreshStatesMutation.isPending ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {Object.entries(groups).map(([status, tasks]) => {
            if (tasks.length === 0) return null;
            const cfg = statusConfig[status] ?? {
              label: status,
              variant: "outline" as const,
            };
            return (
              <section key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold">{cfg.label}</h2>
                  <Badge variant={cfg.variant} className="text-xs">
                    {tasks.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <TaskCard
                      key={`${task.team_id}-${task.id}`}
                      task={task}
                      link={linkMap[`${task.team_id}:${task.id}`]}
                      showManualCloseButton={!settings?.github_close_prompt}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {currentPrompt && (
        <CloseIssuePrompt
          entry={currentPrompt}
          onConfirm={() => closeIssueMutation.mutate(currentPrompt)}
          onDismiss={dismissClosePrompt}
          isPending={closeIssueMutation.isPending}
        />
      )}
    </>
  );
}

// ─── Task card ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  link,
  showManualCloseButton,
}: {
  task: ClaudeTask & { team_id: string };
  link?: TaskGithubLink;
  showManualCloseButton: boolean;
}) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);

  const cfg = statusConfig[task.status] ?? {
    label: task.status,
    variant: "outline" as const,
  };

  const closeIssueMutation = useMutation({
    mutationFn: () =>
      api.closeGithubIssue(
        link!.task_id,
        link!.team_id,
        link!.github_repo!,
        link!.github_issue_number!,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData<TaskGithubLink[]>(["task-github-links"], (old) =>
        old?.map((l) =>
          l.task_id === updated.task_id && l.team_id === updated.team_id
            ? updated
            : l,
        ),
      );
    },
  });

  const canManuallyClose =
    showManualCloseButton &&
    task.status === "completed" &&
    link?.github_repo &&
    link?.github_issue_number != null &&
    link.github_issue_state !== "closed";

  return (
    <>
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/20 transition-colors">
        <CheckSquare className="size-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{task.subject}</p>
            <Badge variant={cfg.variant} className="text-xs shrink-0">
              {cfg.label}
            </Badge>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {task.description}
            </p>
          )}
          {task.active_form && task.status === "in_progress" && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              → {task.active_form}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {task.owner && (
              <span className="text-xs text-muted-foreground">
                {task.owner}
              </span>
            )}
            {task.updated_at && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3" />
                {formatRelativeTime(task.updated_at)}
              </span>
            )}

            {link ? (
              <div className="flex items-center gap-1.5 ml-auto">
                <IssueStateDot state={link.github_issue_state} />
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(link.github_issue_url, "_blank");
                  }}
                  className="text-xs text-primary hover:underline"
                  title={link.github_issue_url}
                >
                  <Link2 className="size-3 inline mr-0.5" />#
                  {link.github_issue_number}
                </a>
                {canManuallyClose && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => closeIssueMutation.mutate()}
                    disabled={closeIssueMutation.isPending}
                  >
                    {closeIssueMutation.isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      "Close"
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowDialog(true)}
                >
                  Edit
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground ml-auto"
                onClick={() => setShowDialog(true)}
              >
                <Link2 className="size-3 mr-1" />
                Link issue
              </Button>
            )}
          </div>
        </div>
      </div>

      {showDialog && (
        <LinkGithubIssueDialog
          task={task}
          existingLink={link}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
