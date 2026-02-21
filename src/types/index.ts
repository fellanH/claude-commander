// ─── Projects ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  path: string;
  tags: string[];
  color: string | null;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  tags?: string[];
  color?: string;
}

// ─── Claude Tasks ──────────────────────────────────────────────────────────

export interface ClaudeTask {
  id: string;
  team_name: string | null;
  subject: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "deleted";
  owner: string | null;
  active_form: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ClaudeTaskFile {
  team_id: string;
  tasks: ClaudeTask[];
}

// ─── Claude Plans ──────────────────────────────────────────────────────────

export interface ClaudePlan {
  id: string;
  filename: string;
  title: string;
  preview: string;
  content: string;
  modified_at: string | null;
}

// ─── Claude Sessions ───────────────────────────────────────────────────────

export interface ClaudeSession {
  id: string;
  project_key: string;
  cwd: string | null;
  message_count: number;
  last_message_at: string | null;
  project_id: string | null;
}

// ─── Git ───────────────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFile[];
  unstaged: GitFile[];
  untracked: string[];
}

export interface GitFile {
  path: string;
  status: string;
}

export interface GitCommit {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: string;
}

export interface GitBranch {
  name: string;
  is_head: boolean;
  upstream: string | null;
}

// ─── Env ───────────────────────────────────────────────────────────────────

export interface EnvFile {
  filename: string;
  path: string;
  var_count: number;
}

export interface EnvVar {
  key: string;
  value: string;
  masked: boolean;
}

// ─── Deploy ────────────────────────────────────────────────────────────────

export interface DeployConfig {
  kind: "fly" | "vercel";
  app_name: string | null;
  region: string | null;
  raw: Record<string, unknown>;
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface AppSettings {
  scan_path: string | null;
  theme: string;
  terminal: string;
}

export interface TerminalInfo {
  detected: string;
  available: string[];
}

// ─── Planning Items ────────────────────────────────────────────────────────

export type PlanningStatus = "backlog" | "todo" | "in_progress" | "done";

export interface PlanningItem {
  id: string;
  project_id: string | null;
  subject: string;
  description: string | null;
  status: PlanningStatus;
  priority: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanningItemInput {
  project_id: string;
  subject: string;
  description?: string;
  status: PlanningStatus;
}

export interface UpdatePlanningItemInput {
  id: string;
  subject: string;
  description?: string;
}

// ─── PTY (in-app terminal) ─────────────────────────────────────────────────

export interface PtyOutputPayload {
  pty_id: string;
  data: number[]; // Vec<u8> as JSON array
}

export interface PtyExitPayload {
  pty_id: string;
}
