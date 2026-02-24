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
  identity_key: string | null;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  tags?: string[];
  color?: string;
  identity_key?: string;
}

export interface SyncResult {
  /** Projects whose on-disk path changed (renamed or relocated). */
  updated: Project[];
  /** Brand-new projects discovered by the scan. */
  added: Project[];
  /** Number of projects that matched exactly and needed no change. */
  unchanged_count: number;
  /** Number of DB records soft-deleted because their path no longer exists. */
  archived_count: number;
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

export interface SessionMessage {
  uuid: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ClaudeSession {
  id: string;
  project_key: string;
  cwd: string | null;
  message_count: number;
  last_message_at: string | null;
  project_id: string | null;
}

export interface SessionToolCall {
  id: string;
  name: string;
  /** Compact JSON string of the tool input */
  input: string;
  output: string | null;
}

export interface SessionTurn {
  uuid: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tool_calls: SessionToolCall[];
}

export interface SessionDetail {
  turns: SessionTurn[];
  /** Total line count before the 500-turn cap */
  total_count: number;
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
  onboarding_completed: boolean;
  /** When true, completing a task with a linked issue prompts to close it. */
  github_close_prompt: boolean;
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

// ─── Search Results ────────────────────────────────────────────────────────

export interface SearchProjectResult {
  id: string;
  name: string;
  path: string;
  tags: string[];
  color: string | null;
}

export interface SearchPlanningItemResult {
  id: string;
  project_id: string | null;
  project_name: string;
  subject: string;
  description: string | null;
  status: string;
}

export interface SearchPlanResult {
  id: string;
  filename: string;
  title: string;
  preview: string;
  modified_at: string | null;
}

export interface SearchTaskResult {
  id: string;
  team_id: string;
  team_name: string | null;
  subject: string;
  description: string | null;
  status: string;
}

export interface SearchResults {
  projects: SearchProjectResult[];
  planning_items: SearchPlanningItemResult[];
  plans: SearchPlanResult[];
  tasks: SearchTaskResult[];
}

// ─── GitHub Issue Links ────────────────────────────────────────────────────

export interface TaskGithubLink {
  task_id: string;
  team_id: string;
  github_issue_url: string;
  github_issue_number: number | null;
  github_repo: string | null;
  created_at: string;
  /** Cached issue state — `"open"`, `"closed"`, or `null` if not yet fetched. */
  github_issue_state: "open" | "closed" | null;
  state_updated_at: string | null;
}

export interface UpsertTaskGithubLinkInput {
  task_id: string;
  team_id: string;
  github_issue_url: string;
  github_issue_number?: number;
  github_repo?: string;
}

export interface CreateGithubIssueOutput {
  number: number;
  url: string;
}

// ─── Updater ───────────────────────────────────────────────────────────────

export interface UpdateInfo {
  available: boolean;
  version?: string;
  body?: string;
}

// ─── PTY (in-app terminal) ─────────────────────────────────────────────────

export interface PtyOutputPayload {
  pty_id: string;
  data: number[]; // Vec<u8> as JSON array
}

export interface PtyExitPayload {
  pty_id: string;
}
