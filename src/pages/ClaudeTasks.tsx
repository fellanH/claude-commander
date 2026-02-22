import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Clock, Link2, Loader2 } from "lucide-react";
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

export default function ClaudeTasks() {
  const {
    data: taskFiles,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["claude-tasks"],
    queryFn: api.readClaudeTasks,
    staleTime: 30_000,
  });

  const { data: links } = useQuery({
    queryKey: ["task-github-links"],
    queryFn: api.getTaskGithubLinks,
  });

  useClaudeWatcher("claude-tasks-changed", refetch);

  // Build a lookup map: `${team_id}:${task_id}` → TaskGithubLink
  const linkMap: Record<string, TaskGithubLink> = {};
  for (const link of links ?? []) {
    linkMap[`${link.team_id}:${link.task_id}`] = link;
  }

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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Tasks</h1>
        <span className="text-sm text-muted-foreground">
          {allTasks.length} total
        </span>
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
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  link,
}: {
  task: ClaudeTask & { team_id: string };
  link?: TaskGithubLink;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const cfg = statusConfig[task.status] ?? {
    label: task.status,
    variant: "outline" as const,
  };

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

            {/* GitHub issue badge */}
            {link ? (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(link.github_issue_url, "_blank");
                }}
                className="flex items-center gap-1 text-xs text-primary hover:underline ml-auto"
                title={link.github_issue_url}
              >
                <Link2 className="size-3" />#{link.github_issue_number}
              </a>
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

            {/* Edit link if already linked */}
            {link && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowDialog(true)}
              >
                Edit
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
