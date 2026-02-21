import { useParams, Navigate, Outlet, NavLink } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const project = projects?.find((p) => p.id === projectId);
  if (!project) {
    return <Navigate to="/projects" replace />;
  }

  return <Outlet context={{ project }} />;
}
