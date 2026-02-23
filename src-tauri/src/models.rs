use serde::{Deserialize, Serialize};

// ─── Projects ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub tags: Vec<String>,
    pub color: Option<String>,
    pub sort_order: i64,
    pub is_archived: bool,
    pub created_at: String,
    pub identity_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub path: String,
    pub tags: Option<Vec<String>>,
    pub color: Option<String>,
    pub identity_key: Option<String>,
}

// ─── Planning Items ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningItem {
    pub id: String,
    pub project_id: Option<String>,
    pub subject: String,
    pub description: Option<String>,
    pub status: PlanningStatus,
    pub priority: i64,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlanningStatus {
    Backlog,
    Todo,
    InProgress,
    Done,
}

impl std::fmt::Display for PlanningStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlanningStatus::Backlog => write!(f, "backlog"),
            PlanningStatus::Todo => write!(f, "todo"),
            PlanningStatus::InProgress => write!(f, "in_progress"),
            PlanningStatus::Done => write!(f, "done"),
        }
    }
}

// ─── Planning Item Inputs ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePlanningItemInput {
    pub project_id: String,
    pub subject: String,
    pub description: Option<String>,
    pub status: String, // validated by DB CHECK constraint
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePlanningItemInput {
    pub id: String,
    pub subject: String,
    pub description: Option<String>,
}

// ─── Claude Tasks ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeTask {
    pub id: String,
    pub team_name: Option<String>,
    pub subject: String,
    pub description: Option<String>,
    pub status: String,
    pub owner: Option<String>,
    pub active_form: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeTaskFile {
    pub team_id: String,
    pub tasks: Vec<ClaudeTask>,
}

// ─── Claude Plans ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudePlan {
    pub id: String,
    pub filename: String,
    pub title: String,
    pub preview: String,
    pub content: String,
    pub modified_at: Option<String>,
}

// ─── Claude Sessions ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMessage {
    pub uuid: String,
    pub role: String,    // "user" | "assistant"
    pub content: String, // extracted text
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSession {
    pub id: String,
    pub project_key: String,
    pub cwd: Option<String>,
    pub message_count: usize,
    pub last_message_at: Option<String>,
    pub project_id: Option<String>,
}

// ─── Git ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<GitFile>,
    pub unstaged: Vec<GitFile>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_head: bool,
    pub upstream: Option<String>,
}

// ─── Env Vars ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvFile {
    pub filename: String,
    pub path: String,
    pub var_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
    pub masked: bool,
}

// ─── Deploy Config ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployConfig {
    pub kind: String, // "fly" | "vercel"
    pub app_name: Option<String>,
    pub region: Option<String>,
    pub raw: serde_json::Value,
}

// ─── Search Results ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchProjectResult {
    pub id: String,
    pub name: String,
    pub path: String,
    pub tags: Vec<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchPlanningItemResult {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: String,
    pub subject: String,
    pub description: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchPlanResult {
    pub id: String,
    pub filename: String,
    pub title: String,
    pub preview: String,
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchTaskResult {
    pub id: String,
    pub team_id: String,
    pub team_name: Option<String>,
    pub subject: String,
    pub description: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResults {
    pub projects: Vec<SearchProjectResult>,
    pub planning_items: Vec<SearchPlanningItemResult>,
    pub plans: Vec<SearchPlanResult>,
    pub tasks: Vec<SearchTaskResult>,
}

// ─── GitHub Issue Links ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGithubLink {
    pub task_id: String,
    pub team_id: String,
    pub github_issue_url: String,
    pub github_issue_number: Option<i64>,
    pub github_repo: Option<String>,
    pub created_at: String,
    /// Cached issue state: `"open"` or `"closed"`.  `None` = not yet fetched.
    pub github_issue_state: Option<String>,
    /// When `github_issue_state` was last refreshed.
    pub state_updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertTaskGithubLinkInput {
    pub task_id: String,
    pub team_id: String,
    pub github_issue_url: String,
    pub github_issue_number: Option<i64>,
    pub github_repo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGithubIssueOutput {
    pub number: i64,
    pub url: String,
}

// ─── Sync Result ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    /// Projects whose on-disk path differed from the DB record (renamed/moved).
    pub updated: Vec<Project>,
    /// Brand-new projects discovered by the scan.
    pub added: Vec<Project>,
    /// Number of projects that matched exactly and needed no change.
    pub unchanged_count: usize,
    /// Number of DB records archived because their path no longer exists on disk.
    pub archived_count: usize,
}

// ─── Settings ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub scan_path: Option<String>,
    pub theme: String,
    pub terminal: String,
    pub onboarding_completed: bool,
    /// When `true`, completing a task that has a linked GitHub issue prompts
    /// the user to close the issue automatically.
    pub github_close_prompt: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            scan_path: dirs::home_dir()
                .map(|h| h.join("cv").to_string_lossy().to_string()),
            theme: "system".to_string(),
            terminal: "auto".to_string(),
            onboarding_completed: false,
            github_close_prompt: true,
        }
    }
}
