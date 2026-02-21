import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  ClaudePlan,
  ClaudeSession,
  ClaudeTaskFile,
  SessionMessage,
  CreatePlanningItemInput,
  CreateProjectInput,
  DeployConfig,
  EnvFile,
  EnvVar,
  GitBranch,
  GitCommit,
  GitStatus,
  PlanningItem,
  PlanningStatus,
  Project,
  TerminalInfo,
  UpdatePlanningItemInput,
} from "@/types";

// ─── Projects ──────────────────────────────────────────────────────────────

export const api = {
  // Projects
  scanProjects: (scan_path?: string) =>
    invoke<Project[]>("scan_projects", { scanPath: scan_path }),

  getProjects: () => invoke<Project[]>("get_projects"),

  upsertProject: (project: CreateProjectInput) =>
    invoke<Project>("upsert_project", { project }),

  deleteProject: (project_id: string) =>
    invoke<void>("delete_project", { projectId: project_id }),

  importScannedProjects: (projects: CreateProjectInput[]) =>
    invoke<Project[]>("import_scanned_projects", { projects }),

  // Claude
  readClaudeTasks: () => invoke<ClaudeTaskFile[]>("read_claude_tasks"),

  listClaudePlans: () => invoke<ClaudePlan[]>("list_claude_plans"),

  readClaudePlan: (filename: string) =>
    invoke<string>("read_claude_plan", { filename }),

  readClaudeSessions: () => invoke<ClaudeSession[]>("read_claude_sessions"),

  readSessionMessages: (project_key: string, session_id: string) =>
    invoke<SessionMessage[]>("read_session_messages", {
      projectKey: project_key,
      sessionId: session_id,
    }),

  // Terminal
  detectTerminal: () => invoke<TerminalInfo>("detect_terminal"),

  launchClaude: (project_path: string, terminal?: string) =>
    invoke<void>("launch_claude", { projectPath: project_path, terminal }),

  // Git
  gitStatus: (project_path: string) =>
    invoke<GitStatus>("git_status", { projectPath: project_path }),

  gitLog: (project_path: string, limit?: number) =>
    invoke<GitCommit[]>("git_log", { projectPath: project_path, limit }),

  gitBranches: (project_path: string) =>
    invoke<GitBranch[]>("git_branches", { projectPath: project_path }),

  // Env
  listEnvFiles: (project_path: string) =>
    invoke<EnvFile[]>("list_env_files", { projectPath: project_path }),

  getEnvVars: (env_file_path: string) =>
    invoke<EnvVar[]>("get_env_vars", { envFilePath: env_file_path }),

  setEnvVar: (env_file_path: string, key: string, value: string) =>
    invoke<void>("set_env_var", { envFilePath: env_file_path, key, value }),

  deleteEnvVar: (env_file_path: string, key: string) =>
    invoke<void>("delete_env_var", { envFilePath: env_file_path, key }),

  getDeployConfigs: (project_path: string) =>
    invoke<DeployConfig[]>("get_deploy_configs", { projectPath: project_path }),

  // Planning
  getPlanningItems: (project_id: string) =>
    invoke<PlanningItem[]>("get_planning_items", { projectId: project_id }),

  createPlanningItem: (item: CreatePlanningItemInput) =>
    invoke<PlanningItem>("create_planning_item", { item }),

  updatePlanningItem: (item: UpdatePlanningItemInput) =>
    invoke<PlanningItem>("update_planning_item", { item }),

  movePlanningItem: (id: string, status: PlanningStatus, sort_order: number) =>
    invoke<void>("move_planning_item", { id, status, sortOrder: sort_order }),

  deletePlanningItem: (id: string) =>
    invoke<void>("delete_planning_item", { id }),

  // Settings
  getSettings: () => invoke<AppSettings>("get_settings"),

  updateSettings: (settings: AppSettings) =>
    invoke<void>("update_settings", { settings }),

  // PTY (in-app terminal)
  ptyCreate: (project_path: string, cols: number, rows: number) =>
    invoke<string>("pty_create", { projectPath: project_path, cols, rows }),

  ptyWrite: (pty_id: string, data: number[]) =>
    invoke<void>("pty_write", { ptyId: pty_id, data }),

  ptyResize: (pty_id: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { ptyId: pty_id, cols, rows }),

  ptyKill: (pty_id: string) => invoke<void>("pty_kill", { ptyId: pty_id }),
};
