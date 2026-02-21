import { useOutletContext } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Loader2 } from "lucide-react";
import { useClaudeWatcher } from "@/hooks/useClaudeWatcher";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types";

const statusConfig = {
  pending: { label: "Pending", variant: "secondary" as const },
  in_progress: { label: "In Progress", variant: "info" as const },
  completed: { label: "Done", variant: "success" as const },
  deleted: { label: "Deleted", variant: "outline" as const },
};

export default function ProjectTasks() {
  const { project } = useOutletContext<{ project: Project }>();

  const {
    data: taskFiles,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["claude-tasks"],
    queryFn: api.readClaudeTasks,
    staleTime: 30_000,
  });

  useClaudeWatcher("claude-tasks-changed", refetch);

  const allTasks =
    taskFiles?.flatMap((tf) =>
      tf.tasks.map((t) => ({ ...t, team_id: tf.team_id })),
    ) ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <span className="text-xs text-muted-foreground">
          {allTasks.length} total (all teams)
        </span>
      </div>

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : allTasks.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <CheckSquare className="size-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No tasks found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allTasks.map((task) => {
            const cfg = statusConfig[
              task.status as keyof typeof statusConfig
            ] ?? {
              label: task.status,
              variant: "outline" as const,
            };
            return (
              <div
                key={`${task.team_id}-${task.id}`}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
              >
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
                  {task.updated_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(task.updated_at)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
