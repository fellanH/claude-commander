import { NavLink, useLocation, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid,
  CheckSquare,
  FileText,
  LayoutList,
  History,
  Terminal,
  GitBranch,
  KeyRound,
  Rocket,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Button } from "./ui/button";

export function SecondaryNav() {
  const location = useLocation();
  const { projectId } = useParams();

  const isProjects = location.pathname.startsWith("/projects");
  const isClaude = location.pathname.startsWith("/claude");
  const isDashboard = location.pathname === "/";
  const isSettings = location.pathname.startsWith("/settings");

  if (isDashboard || isSettings) return null;

  if (isProjects && !projectId) {
    return <ProjectsListNav />;
  }

  if (isProjects && projectId) {
    return <ProjectDetailNav projectId={projectId} />;
  }

  if (isClaude) {
    return <ClaudeNav />;
  }

  return null;
}

function ProjectsListNav() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
    staleTime: 60_000,
  });

  return (
    <aside className="w-[220px] border-r border-border bg-card flex flex-col shrink-0">
      <div className="px-4 h-12 flex items-center justify-between border-b border-border">
        <span className="text-sm font-semibold">Projects</span>
        <NavLink to="/projects/new">
          <Button variant="ghost" size="icon" className="size-7">
            <Plus className="size-4" />
          </Button>
        </NavLink>
      </div>

      <nav className="flex-1 overflow-auto p-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {projects?.map((project) => (
          <NavLink
            key={project.id}
            to={`/projects/${project.id}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )
            }
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: project.color || "#6366f1" }}
            />
            <span className="truncate">{project.name}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

const projectDetailItems = [
  { path: "overview", icon: LayoutGrid, label: "Overview" },
  { path: "tasks", icon: CheckSquare, label: "Tasks" },
  { path: "plans", icon: FileText, label: "Plans" },
  { path: "kanban", icon: LayoutList, label: "Kanban" },
  { path: "sessions", icon: History, label: "Sessions" },
  { path: "terminal", icon: Terminal, label: "Terminal" },
  { path: "git", icon: GitBranch, label: "Git" },
  { path: "env", icon: KeyRound, label: "Env Vars" },
  { path: "deploy", icon: Rocket, label: "Deploy" },
];

function ProjectDetailNav({ projectId }: { projectId: string }) {
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
    staleTime: 60_000,
  });

  const project = projects?.find((p) => p.id === projectId);

  return (
    <aside className="w-[220px] border-r border-border bg-card flex flex-col shrink-0">
      <div className="px-4 h-12 flex items-center border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: project?.color || "#6366f1" }}
          />
          <span className="text-sm font-semibold truncate">
            {project?.name || "Project"}
          </span>
        </div>
      </div>

      <nav className="flex-1 p-2">
        {projectDetailItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={`/projects/${projectId}/${path}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

const claudeNavItems = [
  { path: "/claude/tasks", icon: CheckSquare, label: "Tasks" },
  { path: "/claude/plans", icon: FileText, label: "Plans" },
  { path: "/claude/sessions", icon: Terminal, label: "Sessions" },
];

function ClaudeNav() {
  return (
    <aside className="w-[220px] border-r border-border bg-card flex flex-col shrink-0">
      <div className="px-4 h-12 flex items-center border-b border-border">
        <span className="text-sm font-semibold">Claude</span>
      </div>

      <nav className="flex-1 p-2">
        {claudeNavItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
