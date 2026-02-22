import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Loader2, Trash2, Github } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { ClaudeTask, TaskGithubLink } from "@/types";

interface Props {
  task: ClaudeTask & { team_id: string };
  existingLink?: TaskGithubLink;
  /** Pre-detected repo for the project context, e.g. "owner/repo" */
  detectedRepo?: string | null;
  onClose: () => void;
}

type Mode = "create" | "link";

export function LinkGithubIssueDialog({
  task,
  existingLink,
  detectedRepo,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>(existingLink ? "link" : "create");

  // Create new issue state
  const [repo, setRepo] = useState(detectedRepo ?? "");
  const [title, setTitle] = useState(task.subject);
  const [body, setBody] = useState(task.description ?? "");

  // Link existing state
  const [issueUrl, setIssueUrl] = useState(
    existingLink?.github_issue_url ?? "",
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["task-github-links"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!repo.trim())
        throw new Error("Repository is required (e.g. owner/repo)");
      const created = await api.createGithubIssue(
        repo.trim(),
        title.trim(),
        body.trim(),
      );
      await api.upsertTaskGithubLink({
        task_id: task.id,
        team_id: task.team_id,
        github_issue_url: created.url,
        github_issue_number: created.number,
        github_repo: repo.trim(),
      });
      return created;
    },
    onSuccess: (created) => {
      invalidate();
      toast.success(`Issue #${created.number} created and linked`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const url = issueUrl.trim();
      if (!url.startsWith("https://github.com/")) {
        throw new Error("Please enter a full GitHub issue URL");
      }
      await api.upsertTaskGithubLink({
        task_id: task.id,
        team_id: task.team_id,
        github_issue_url: url,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Issue linked");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: () => api.deleteTaskGithubLink(task.id, task.team_id),
    onSuccess: () => {
      invalidate();
      toast.success("Link removed");
      onClose();
    },
    onError: () => toast.error("Failed to remove link"),
  });

  const isPending =
    createMutation.isPending ||
    linkMutation.isPending ||
    unlinkMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Github className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Link to GitHub Issue</h2>
        </div>

        {/* Task subject */}
        <p className="text-xs text-muted-foreground mb-4 line-clamp-1">
          Task: <span className="text-foreground">{task.subject}</span>
        </p>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-muted rounded-lg">
          <button
            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
              mode === "create"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("create")}
          >
            Create New Issue
          </button>
          <button
            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
              mode === "link"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("link")}
          >
            Link Existing
          </button>
        </div>

        {mode === "create" ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Repository <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full text-sm bg-muted border border-border rounded-md px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                placeholder="owner/repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Title
              </label>
              <input
                className="w-full text-sm bg-muted border border-border rounded-md px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Body
              </label>
              <textarea
                className="w-full text-sm bg-muted border border-border rounded-md px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => createMutation.mutate()}
                disabled={isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-3 mr-1.5 animate-spin" />
                ) : (
                  <ExternalLink className="size-3 mr-1.5" />
                )}
                Create &amp; Open
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {existingLink && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-xs">
                <Link2 className="size-3 text-muted-foreground shrink-0" />
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(existingLink.github_issue_url, "_blank");
                  }}
                  className="text-primary truncate hover:underline"
                >
                  #{existingLink.github_issue_number} —{" "}
                  {existingLink.github_repo}
                </a>
                <button
                  className="ml-auto text-destructive hover:text-destructive/80"
                  onClick={() => unlinkMutation.mutate()}
                  disabled={isPending}
                  title="Remove link"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                GitHub Issue URL
              </label>
              <input
                className="w-full text-sm bg-muted border border-border rounded-md px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                placeholder="https://github.com/owner/repo/issues/123"
                value={issueUrl}
                onChange={(e) => setIssueUrl(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => linkMutation.mutate()}
                disabled={isPending}
              >
                {linkMutation.isPending ? (
                  <Loader2 className="size-3 mr-1.5 animate-spin" />
                ) : (
                  <Link2 className="size-3 mr-1.5" />
                )}
                Link Issue
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
