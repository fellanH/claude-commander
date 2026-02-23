use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{CreateGithubIssueOutput, TaskGithubLink, UpsertTaskGithubLinkInput};
use crate::state::AppState;
use tauri::State;

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Parse a GitHub remote URL into `"owner/repo"` format.
/// Handles both HTTPS (`https://github.com/owner/repo.git`) and SSH
/// (`git@github.com:owner/repo.git`) forms.
fn parse_github_repo(url: &str) -> Option<String> {
    let url = url.trim();
    let path = if let Some(p) = url.strip_prefix("https://github.com/") {
        p
    } else if let Some(p) = url.strip_prefix("git@github.com:") {
        p
    } else {
        return None;
    };
    let repo = path.trim_end_matches('/').trim_end_matches(".git");
    // Must look like "owner/repo" (exactly one slash, non-empty parts)
    let parts: Vec<&str> = repo.splitn(2, '/').collect();
    if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
        Some(repo.to_string())
    } else {
        None
    }
}

/// Parse the `#number` from a GitHub issue URL such as
/// `https://github.com/owner/repo/issues/123`.
fn parse_issue_number(url: &str) -> Option<i64> {
    url.rsplit('/').next()?.parse::<i64>().ok()
}

/// Parse `"owner/repo"` from a GitHub issue URL.
fn parse_repo_from_url(url: &str) -> Option<String> {
    // https://github.com/owner/repo/issues/123
    let path = url.strip_prefix("https://github.com/")?;
    let parts: Vec<&str> = path.splitn(3, '/').collect();
    if parts.len() >= 2 {
        Some(format!("{}/{}", parts[0], parts[1]))
    } else {
        None
    }
}

fn open_in_browser(url: &str) {
    let _ = std::process::Command::new("open").arg(url).spawn();
}

// ─── Commands ───────────────────────────────────────────────────────────────

/// Return the GitHub `"owner/repo"` string for the git repository at
/// `project_path`, or `null` if the directory has no GitHub origin remote.
#[tauri::command]
pub fn detect_github_repo(project_path: String) -> Option<String> {
    let repo = git2::Repository::open(&project_path).ok()?;
    let remote = repo.find_remote("origin").ok()?;
    let url = remote.url()?.to_string();
    parse_github_repo(&url)
}

/// Call `gh issue create` and open the resulting URL in the default browser.
/// Returns `{ number, url }` on success.
#[tauri::command]
pub fn create_github_issue(
    repo: String,
    title: String,
    body: String,
) -> CmdResult<CreateGithubIssueOutput> {
    let output = std::process::Command::new("gh")
        .args([
            "issue", "create",
            "--repo", &repo,
            "--title", &title,
            "--body", &body,
            "--json", "number,url",
        ])
        .output()
        .map_err(|e| {
            to_cmd_err(CommanderError::internal(format!(
                "Failed to run gh CLI: {}. Is gh installed?",
                e
            )))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(to_cmd_err(CommanderError::internal(format!(
            "gh issue create failed: {}",
            stderr.trim()
        ))));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|e| {
        to_cmd_err(CommanderError::internal(format!(
            "Failed to parse gh output: {}",
            e
        )))
    })?;

    let number = json["number"].as_i64().ok_or_else(|| {
        to_cmd_err(CommanderError::internal("Missing 'number' in gh output"))
    })?;

    let url = json["url"]
        .as_str()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("Missing 'url' in gh output")))?
        .to_string();

    open_in_browser(&url);

    Ok(CreateGithubIssueOutput { number, url })
}

/// Persist (insert or replace) a task → GitHub issue link.
#[tauri::command]
pub fn upsert_task_github_link(
    state: State<AppState>,
    link: UpsertTaskGithubLinkInput,
) -> CmdResult<TaskGithubLink> {
    // Derive number / repo from URL when the caller didn't supply them.
    let number = link
        .github_issue_number
        .or_else(|| parse_issue_number(&link.github_issue_url));
    let repo = link
        .github_repo
        .clone()
        .or_else(|| parse_repo_from_url(&link.github_issue_url));

    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO task_github_links
             (task_id, team_id, github_issue_url, github_issue_number, github_repo, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(task_id, team_id) DO UPDATE SET
             github_issue_url    = excluded.github_issue_url,
             github_issue_number = excluded.github_issue_number,
             github_repo         = excluded.github_repo",
        rusqlite::params![
            link.task_id,
            link.team_id,
            link.github_issue_url,
            number,
            repo,
            now
        ],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(TaskGithubLink {
        task_id: link.task_id,
        team_id: link.team_id,
        github_issue_url: link.github_issue_url,
        github_issue_number: number,
        github_repo: repo,
        created_at: now,
        github_issue_state: None,
        state_updated_at: None,
    })
}

/// Return all task → GitHub issue links (used to build a lookup map in the UI).
#[tauri::command]
pub fn get_task_github_links(state: State<AppState>) -> CmdResult<Vec<TaskGithubLink>> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    load_all_links(conn).map_err(to_cmd_err)
}

fn load_all_links(conn: &rusqlite::Connection) -> Result<Vec<TaskGithubLink>, CommanderError> {
    let mut stmt = conn
        .prepare(
            "SELECT task_id, team_id, github_issue_url, github_issue_number,
                    github_repo, created_at, github_issue_state, state_updated_at
             FROM task_github_links ORDER BY created_at DESC",
        )
        .map_err(CommanderError::from)?;

    let links = stmt
        .query_map([], |row| {
            Ok(TaskGithubLink {
                task_id: row.get(0)?,
                team_id: row.get(1)?,
                github_issue_url: row.get(2)?,
                github_issue_number: row.get(3)?,
                github_repo: row.get(4)?,
                created_at: row.get(5)?,
                github_issue_state: row.get(6)?,
                state_updated_at: row.get(7)?,
            })
        })
        .map_err(CommanderError::from)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(links)
}

/// Close a linked GitHub issue via `gh issue close` and cache the new state.
#[tauri::command]
pub fn close_github_issue(
    state: State<AppState>,
    task_id: String,
    team_id: String,
    repo: String,
    number: i64,
) -> CmdResult<TaskGithubLink> {
    let output = std::process::Command::new("gh")
        .args(["issue", "close", &number.to_string(), "--repo", &repo])
        .output()
        .map_err(|e| {
            to_cmd_err(CommanderError::internal(format!(
                "Failed to run gh CLI: {}",
                e
            )))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(to_cmd_err(CommanderError::internal(format!(
            "gh issue close failed: {}",
            stderr.trim()
        ))));
    }

    let now = chrono::Utc::now().to_rfc3339();

    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    conn.execute(
        "UPDATE task_github_links
         SET github_issue_state = 'closed', state_updated_at = ?1
         WHERE task_id = ?2 AND team_id = ?3",
        rusqlite::params![now, task_id, team_id],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    // Return the full updated link.
    let link = conn
        .query_row(
            "SELECT task_id, team_id, github_issue_url, github_issue_number,
                    github_repo, created_at, github_issue_state, state_updated_at
             FROM task_github_links WHERE task_id = ?1 AND team_id = ?2",
            rusqlite::params![task_id, team_id],
            |row| {
                Ok(TaskGithubLink {
                    task_id: row.get(0)?,
                    team_id: row.get(1)?,
                    github_issue_url: row.get(2)?,
                    github_issue_number: row.get(3)?,
                    github_repo: row.get(4)?,
                    created_at: row.get(5)?,
                    github_issue_state: row.get(6)?,
                    state_updated_at: row.get(7)?,
                })
            },
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(link)
}

/// Fetch the current state of every linked GitHub issue via `gh issue view`
/// and update the cache.  Skips links where repo or number are missing.
/// Failures for individual issues are silently skipped so a single bad link
/// does not abort the whole refresh.
#[tauri::command]
pub fn fetch_issue_states(state: State<AppState>) -> CmdResult<Vec<TaskGithubLink>> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let links = load_all_links(conn).map_err(to_cmd_err)?;
    let now = chrono::Utc::now().to_rfc3339();

    for link in &links {
        let (Some(repo), Some(number)) = (&link.github_repo, link.github_issue_number) else {
            continue;
        };

        let Ok(output) = std::process::Command::new("gh")
            .args([
                "issue", "view",
                &number.to_string(),
                "--repo", repo,
                "--json", "state",
            ])
            .output()
        else {
            continue;
        };

        if !output.status.success() {
            continue;
        }

        let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
            continue;
        };

        // GitHub returns "OPEN" / "CLOSED" (uppercase).
        let state_str = json["state"]
            .as_str()
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        if state_str == "open" || state_str == "closed" {
            let _ = conn.execute(
                "UPDATE task_github_links
                 SET github_issue_state = ?1, state_updated_at = ?2
                 WHERE task_id = ?3 AND team_id = ?4",
                rusqlite::params![state_str, now, link.task_id, link.team_id],
            );
        }
    }

    load_all_links(conn).map_err(to_cmd_err)
}

/// Remove the GitHub issue link for a task.
#[tauri::command]
pub fn delete_task_github_link(
    state: State<AppState>,
    task_id: String,
    team_id: String,
) -> CmdResult<()> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    conn.execute(
        "DELETE FROM task_github_links WHERE task_id = ?1 AND team_id = ?2",
        rusqlite::params![task_id, team_id],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(())
}
