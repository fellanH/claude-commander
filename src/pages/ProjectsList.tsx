import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { listen } from "@tauri-apps/api/event";
import {
  FolderOpen,
  ScanSearch,
  Loader2,
  Archive,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getProjectColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types";

export default function ProjectsList() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
  });

  const { data: archivedProjects } = useQuery({
    queryKey: ["projects-archived"],
    queryFn: api.getArchivedProjects,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncProjects(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects-archived"] });
      const parts: string[] = [];
      if (result.added.length > 0) parts.push(`${result.added.length} added`);
      if (result.updated.length > 0)
        parts.push(
          `${result.updated.length} path${result.updated.length > 1 ? "s" : ""} updated`,
        );
      if (result.archived_count > 0)
        parts.push(`${result.archived_count} archived`);
      if (parts.length === 0)
        parts.push(`${result.unchanged_count} already up to date`);
      toast.success(`Sync complete — ${parts.join(", ")}`);
    },
    onError: () => {
      toast.error("Sync failed");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.restoreProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects-archived"] });
      toast.success("Project restored");
    },
    onError: () => toast.error("Failed to restore project"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects-archived"] });
      toast.success("Project permanently deleted");
    },
    onError: () => toast.error("Failed to delete project"),
  });

  // Listen for directory-removal events from the file watcher and auto-sync.
  useEffect(() => {
    const unlisten = listen("projects-stale", () => {
      syncMutation.mutate();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const archivedCount = archivedProjects?.length ?? 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {projects?.length ?? 0} project(s) in ~/cv/
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive className="size-4 mr-2" />
              {showArchived ? "Hide" : "Show"} archived ({archivedCount})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <ScanSearch className="size-4 mr-2" />
            )}
            Sync Projects
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-lg">
          <FolderOpen className="size-10 text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click "Sync Projects" to auto-discover your projects
          </p>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <ScanSearch className="size-4 mr-2" />
            Scan Now
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {showArchived && archivedCount > 0 && (
        <div className="mt-8">
          <p className="text-sm font-medium text-muted-foreground mb-3">
            Archived — path no longer found on disk
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedProjects!.map((project) => (
              <ArchivedProjectCard
                key={project.id}
                project={project}
                onRestore={() => restoreMutation.mutate(project.id)}
                onDelete={() => deleteMutation.mutate(project.id)}
                isPending={
                  restoreMutation.isPending || deleteMutation.isPending
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const color = getProjectColor(project.color, project.name);

  return (
    <Link to={`/projects/${project.id}`}>
      <div className="p-4 rounded-lg border border-border bg-card hover:shadow-sm hover:border-border/80 transition-all group">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: color }}
          >
            {project.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
              {project.path.replace("/Users/admin/", "~/")}
            </p>
          </div>
        </div>

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function ArchivedProjectCard({
  project,
  onRestore,
  onDelete,
  isPending,
}: {
  project: Project;
  onRestore: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const color = getProjectColor(project.color, project.name);

  return (
    <div className="p-4 rounded-lg border border-dashed border-border bg-card/50 opacity-70">
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 grayscale"
          style={{ backgroundColor: color }}
        >
          {project.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate text-muted-foreground">
            {project.name}
          </h3>
          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
            {project.path.replace("/Users/admin/", "~/")}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={onRestore}
          disabled={isPending}
        >
          <RotateCcw className="size-3 mr-1" />
          Restore
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={isPending}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}
