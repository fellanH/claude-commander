import { useOutletContext } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, GitCommit, Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types";

export default function ProjectGit() {
  const { project } = useOutletContext<{ project: Project }>();

  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
  } = useQuery({
    queryKey: ["git-status", project.path],
    queryFn: () => api.gitStatus(project.path),
    retry: false,
  });

  const { data: commits, isLoading: commitsLoading } = useQuery({
    queryKey: ["git-log", project.path],
    queryFn: () => api.gitLog(project.path, 20),
    retry: false,
  });

  const { data: branches } = useQuery({
    queryKey: ["git-branches", project.path],
    queryFn: () => api.gitBranches(project.path),
    retry: false,
  });

  if (statusError) {
    const msg =
      statusError instanceof Error ? statusError.message : String(statusError);
    const isNotRepo =
      msg.includes("not found") ||
      msg.includes("GIT_ERROR") ||
      msg.includes("could not find");
    return (
      <div className="p-6 flex items-start gap-3 text-muted-foreground">
        <AlertCircle className="size-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-foreground text-sm">
            {isNotRepo ? "Not a git repository" : "Git unavailable"}
          </p>
          <p className="text-xs mt-1 font-mono break-all">{msg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold">Git</h2>

      {/* Branch overview */}
      {status && (
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="font-mono text-sm font-medium">{status.branch}</span>
          {status.ahead > 0 && (
            <Badge variant="info" className="text-xs">
              ↑{status.ahead} ahead
            </Badge>
          )}
          {status.behind > 0 && (
            <Badge variant="warning" className="text-xs">
              ↓{status.behind} behind
            </Badge>
          )}
        </div>
      )}

      {/* Branches */}
      {branches && branches.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
            Branches
          </h3>
          <div className="space-y-1">
            {branches.map((b) => (
              <div
                key={b.name}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border text-sm"
              >
                <GitBranch className="size-3.5 text-muted-foreground" />
                <span className={b.is_head ? "font-medium" : ""}>{b.name}</span>
                {b.is_head && (
                  <Badge variant="secondary" className="text-xs ml-auto">
                    HEAD
                  </Badge>
                )}
                {b.upstream && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {b.upstream}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Working tree status */}
      {status && (
        <section>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
            Working Tree
          </h3>
          {status.staged.length === 0 &&
          status.unstaged.length === 0 &&
          status.untracked.length === 0 ? (
            <p className="text-sm text-muted-foreground">Clean working tree</p>
          ) : (
            <div className="space-y-1">
              {status.staged.map((f) => (
                <div
                  key={`staged-${f.path}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
                >
                  <span className="text-green-700 dark:text-green-300 font-sans">
                    S
                  </span>
                  {f.path}
                </div>
              ))}
              {status.unstaged.map((f) => (
                <div
                  key={`unstaged-${f.path}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800"
                >
                  <span className="text-yellow-700 dark:text-yellow-300 font-sans uppercase">
                    {f.status[0]}
                  </span>
                  {f.path}
                </div>
              ))}
              {status.untracked.map((f) => (
                <div
                  key={`untracked-${f}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono bg-muted border border-border"
                >
                  <span className="text-muted-foreground font-sans">?</span>
                  {f}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Commits */}
      <section>
        <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          Recent Commits
        </h3>
        {commitsLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : commits && commits.length > 0 ? (
          <div className="space-y-1">
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-accent/30 transition-colors text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0">
                  {commit.short_hash}
                </span>
                <span className="flex-1 truncate">{commit.message}</span>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">
                    {commit.author.split(" ")[0]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(commit.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No commits</p>
        )}
      </section>
    </div>
  );
}
