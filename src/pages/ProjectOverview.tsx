import { useOutletContext } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  GitBranch,
  Terminal,
  Clock,
  CheckSquare,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatRelativeTime, getProjectColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types";

interface OutletCtx {
  project: Project;
}

export default function ProjectOverview() {
  const { project } = useOutletContext<OutletCtx>();
  const color = getProjectColor(project.color, project.name);

  const { data: gitStatus, isLoading: gitLoading } = useQuery({
    queryKey: ["git-status", project.path],
    queryFn: () => api.gitStatus(project.path),
    retry: false,
  });

  const { data: sessions } = useQuery({
    queryKey: ["claude-sessions"],
    queryFn: api.readClaudeSessions,
  });

  const { data: termInfo } = useQuery({
    queryKey: ["terminal"],
    queryFn: api.detectTerminal,
  });

  const launchMutation = useMutation({
    mutationFn: () => api.launchClaude(project.path, termInfo?.detected),
    onSuccess: () => toast.success("Launched Claude in terminal"),
    onError: () => toast.error("Failed to launch terminal"),
  });

  const projectSessions =
    sessions?.filter((s) => s.cwd && s.cwd.startsWith(project.path)) ?? [];

  const lastSession = projectSessions[0];

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
          style={{ backgroundColor: color }}
        >
          {project.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{project.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {project.path}
          </p>
        </div>
        <Button
          onClick={() => launchMutation.mutate()}
          disabled={launchMutation.isPending}
          className="shrink-0"
        >
          {launchMutation.isPending ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Terminal className="size-4 mr-2" />
          )}
          Open Claude
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <GitBranch className="size-3.5" />
            <span className="text-xs">Branch</span>
          </div>
          {gitLoading ? (
            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
          ) : (
            <p className="text-sm font-mono font-medium">
              {gitStatus?.branch ?? "not a git repo"}
            </p>
          )}
          {gitStatus && (gitStatus.ahead > 0 || gitStatus.behind > 0) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {gitStatus.ahead > 0 && `↑${gitStatus.ahead} `}
              {gitStatus.behind > 0 && `↓${gitStatus.behind}`}
            </p>
          )}
        </div>

        <div className="p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="size-3.5" />
            <span className="text-xs">Last Session</span>
          </div>
          <p className="text-sm font-medium">
            {lastSession
              ? formatRelativeTime(lastSession.last_message_at)
              : "never"}
          </p>
          {lastSession && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {lastSession.message_count} messages
            </p>
          )}
        </div>

        <div className="p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <CheckSquare className="size-3.5" />
            <span className="text-xs">Sessions</span>
          </div>
          <p className="text-sm font-medium">{projectSessions.length}</p>
        </div>
      </div>

      {/* Git changes */}
      {gitStatus && (
        <div className="border border-border rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <GitBranch className="size-4" />
            Git Status
          </h3>
          {gitStatus.staged.length === 0 &&
          gitStatus.unstaged.length === 0 &&
          gitStatus.untracked.length === 0 ? (
            <p className="text-sm text-muted-foreground">Clean working tree</p>
          ) : (
            <div className="space-y-2">
              {gitStatus.staged.map((f) => (
                <div key={f.path} className="flex items-center gap-2 text-xs">
                  <Badge variant="success" className="text-xs px-1.5 py-0">
                    staged
                  </Badge>
                  <span className="font-mono">{f.path}</span>
                </div>
              ))}
              {gitStatus.unstaged.map((f) => (
                <div key={f.path} className="flex items-center gap-2 text-xs">
                  <Badge variant="warning" className="text-xs px-1.5 py-0">
                    {f.status}
                  </Badge>
                  <span className="font-mono">{f.path}</span>
                </div>
              ))}
              {gitStatus.untracked.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    untracked
                  </Badge>
                  <span className="font-mono">{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
