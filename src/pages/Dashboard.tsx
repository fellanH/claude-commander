import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  FolderOpen,
  GitBranch,
  CheckSquare,
  Clock,
  Bot,
  Terminal,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime, getProjectColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.getProjects,
  });

  const { data: taskFiles } = useQuery({
    queryKey: ["claude-tasks"],
    queryFn: api.readClaudeTasks,
  });

  const { data: sessions } = useQuery({
    queryKey: ["claude-sessions"],
    queryFn: api.readClaudeSessions,
  });

  const totalTasks =
    taskFiles?.reduce(
      (sum, tf) =>
        sum + tf.tasks.filter((t) => t.status === "in_progress").length,
      0,
    ) ?? 0;

  const recentSessions = sessions?.slice(0, 5) ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI project command center
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={FolderOpen}
          label="Projects"
          value={projects?.length ?? 0}
          href="/projects"
        />
        <StatCard
          icon={CheckSquare}
          label="Active Tasks"
          value={totalTasks}
          href="/claude/tasks"
        />
        <StatCard
          icon={Bot}
          label="Sessions"
          value={sessions?.length ?? 0}
          href="/claude/sessions"
        />
      </div>

      {/* Projects grid */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Projects</h2>
          <Link to="/projects">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
            </Button>
          </Link>
        </div>

        {!projects || projects.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="Scan your ~/cv/ directory to import projects"
            action={
              <Link to="/projects">
                <Button size="sm">Import Projects</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.slice(0, 6).map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                sessions={sessions ?? []}
                tasks={taskFiles ?? []}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent sessions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Recent Sessions</h2>
          <Link to="/claude/sessions">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
            </Button>
          </Link>
        </div>

        <div className="space-y-2">
          {recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions found</p>
          ) : (
            recentSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors"
              >
                <Terminal className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">
                    {session.cwd?.split("/").pop() ||
                      session.project_key.slice(0, 20)}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {session.cwd}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {session.message_count} msgs
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(session.last_message_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link to={href}>
      <div className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </Link>
  );
}

function ProjectCard({
  project,
  sessions,
  tasks,
}: {
  project: import("@/types").Project;
  sessions: import("@/types").ClaudeSession[];
  tasks: import("@/types").ClaudeTaskFile[];
}) {
  const color = getProjectColor(project.color, project.name);

  // Find sessions for this project by matching cwd
  const projectSessions = sessions.filter(
    (s) => s.cwd && s.cwd.startsWith(project.path),
  );
  const lastSession = projectSessions[0];

  // Count active tasks (by team directories correlating to project... rough heuristic)
  const activeTasks = tasks.reduce(
    (sum, tf) =>
      sum +
      tf.tasks.filter(
        (t) => t.status === "in_progress" || t.status === "pending",
      ).length,
    0,
  );

  return (
    <Link to={`/projects/${project.id}`}>
      <div className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors group">
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: color }}
          >
            {project.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{project.name}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {project.path.replace("/Users/admin/", "~/")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity size-7 shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              api.launchClaude(project.path);
            }}
          >
            <Terminal className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {lastSession && (
            <Badge variant="secondary" className="text-xs">
              <Clock className="size-3 mr-1" />
              {formatRelativeTime(lastSession.last_message_at)}
            </Badge>
          )}
          {activeTasks > 0 && (
            <Badge variant="info" className="text-xs">
              {activeTasks} tasks
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
      <Icon className="size-8 text-muted-foreground mb-3" />
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {action}
    </div>
  );
}
