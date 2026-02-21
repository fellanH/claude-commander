import { Routes, Route, Navigate } from "react-router";
import { RootLayout } from "@/components/RootLayout";
import Dashboard from "@/pages/Dashboard";
import ProjectsList from "@/pages/ProjectsList";
import ProjectDetail from "@/pages/ProjectDetail";
import ProjectOverview from "@/pages/ProjectOverview";
import ProjectTasks from "@/pages/ProjectTasks";
import ProjectPlans from "@/pages/ProjectPlans";
import ProjectTerminal from "@/pages/ProjectTerminal";
import ProjectGit from "@/pages/ProjectGit";
import ProjectEnv from "@/pages/ProjectEnv";
import ProjectDeploy from "@/pages/ProjectDeploy";
import ProjectKanban from "@/pages/ProjectKanban";
import ClaudeTasks from "@/pages/ClaudeTasks";
import ClaudePlans from "@/pages/ClaudePlans";
import ClaudeSessions from "@/pages/ClaudeSessions";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Dashboard />} />

        {/* Projects */}
        <Route path="projects" element={<ProjectsList />} />
        <Route path="projects/:projectId" element={<ProjectDetail />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ProjectOverview />} />
          <Route path="tasks" element={<ProjectTasks />} />
          <Route path="plans" element={<ProjectPlans />} />
          <Route path="kanban" element={<ProjectKanban />} />
          <Route path="terminal" element={<ProjectTerminal />} />
          <Route path="git" element={<ProjectGit />} />
          <Route path="env" element={<ProjectEnv />} />
          <Route path="deploy" element={<ProjectDeploy />} />
        </Route>

        {/* Claude */}
        <Route path="claude">
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<ClaudeTasks />} />
          <Route path="plans" element={<ClaudePlans />} />
          <Route path="sessions" element={<ClaudeSessions />} />
        </Route>

        {/* Settings */}
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
