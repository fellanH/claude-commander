import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { FolderOpen, ScanSearch, Plus, Loader2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getProjectColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types";

export default function ProjectsList() {
  const queryClient = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const scanned = await api.scanProjects();
      const inputs = scanned.map((p) => ({
        name: p.name,
        path: p.path,
        tags: p.tags,
        color: p.color ?? undefined,
      }));
      return api.importScannedProjects(inputs);
    },
    onSuccess: (imported) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Imported ${imported.length} project(s)`);
    },
    onError: () => {
      toast.error("Failed to scan projects");
    },
  });

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <ScanSearch className="size-4 mr-2" />
            )}
            Scan ~/cv/
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
            Click "Scan ~/cv/" to auto-discover your projects
          </p>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
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
