use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{
    SearchPlanResult, SearchPlanningItemResult, SearchProjectResult, SearchResults, SearchTaskResult,
};
use crate::state::AppState;
use tauri::State;

fn claude_dir() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .join(".claude")
}

#[tauri::command]
pub fn global_search(state: State<AppState>, query: String) -> CmdResult<SearchResults> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(SearchResults {
            projects: vec![],
            planning_items: vec![],
            plans: vec![],
            tasks: vec![],
        });
    }

    let like_q = format!("%{}%", q);

    // --- DB queries (lock held only for this block) ---
    let (projects, planning_items) = {
        let db = state
            .db
            .lock()
            .map_err(|_| to_cmd_err(CommanderError::internal("DB lock failed")))?;
        let conn = db
            .as_ref()
            .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

        // Projects
        let mut stmt = conn
            .prepare(
                "SELECT id, name, path, COALESCE(tags,'[]'), color \
                 FROM projects WHERE is_archived=0 \
                 AND (LOWER(name) LIKE ?1 OR LOWER(path) LIKE ?1 \
                      OR LOWER(COALESCE(tags,'')) LIKE ?1) \
                 LIMIT 5",
            )
            .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

        let projects: Vec<SearchProjectResult> = stmt
            .query_map([&like_q], |row| {
                let tags_str: String = row.get(3)?;
                let color: Option<String> = row.get(4)?;
                Ok(SearchProjectResult {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                    color,
                })
            })
            .map_err(|e| to_cmd_err(CommanderError::from(e)))?
            .filter_map(|r| r.ok())
            .collect();

        // Planning items joined with projects for project_name
        let mut stmt2 = conn
            .prepare(
                "SELECT pi.id, pi.project_id, COALESCE(proj.name,''), pi.subject, \
                 COALESCE(pi.description,''), pi.status \
                 FROM planning_items pi \
                 LEFT JOIN projects proj ON pi.project_id = proj.id \
                 WHERE LOWER(pi.subject) LIKE ?1 \
                    OR LOWER(COALESCE(pi.description,'')) LIKE ?1 \
                 ORDER BY pi.updated_at DESC LIMIT 5",
            )
            .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

        let planning_items: Vec<SearchPlanningItemResult> = stmt2
            .query_map([&like_q], |row| {
                let desc: String = row.get(4)?;
                Ok(SearchPlanningItemResult {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    project_name: row.get(2)?,
                    subject: row.get(3)?,
                    description: if desc.is_empty() { None } else { Some(desc) },
                    status: row.get(5)?,
                })
            })
            .map_err(|e| to_cmd_err(CommanderError::from(e)))?
            .filter_map(|r| r.ok())
            .collect();

        (projects, planning_items)
    }; // DB lock released here

    // --- Filesystem: plans ---
    let plans = search_plans(&q);

    // --- Filesystem: tasks ---
    let tasks = search_tasks(&q);

    Ok(SearchResults {
        projects,
        planning_items,
        plans,
        tasks,
    })
}

fn search_plans(q: &str) -> Vec<SearchPlanResult> {
    let plans_dir = claude_dir().join("plans");
    if !plans_dir.exists() {
        return vec![];
    }

    let entries = match std::fs::read_dir(&plans_dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut results = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        if results.len() >= 5 {
            break;
        }

        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let title = content
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l.trim_start_matches("# ").to_string())
            .unwrap_or_else(|| filename.trim_end_matches(".md").to_string());

        // Match on title or first 500 chars of content
        let head: String = content.chars().take(500).collect();
        let searchable = format!("{} {}", title.to_lowercase(), head.to_lowercase());
        if !searchable.contains(q) {
            continue;
        }

        let preview: String = content
            .lines()
            .filter(|l| !l.starts_with('#') && !l.is_empty())
            .take(3)
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(200)
            .collect();

        let modified_at = path
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.to_rfc3339()
            });

        results.push(SearchPlanResult {
            id: filename.trim_end_matches(".md").to_string(),
            filename,
            title,
            preview,
            modified_at,
        });
    }

    results
}

fn search_tasks(q: &str) -> Vec<SearchTaskResult> {
    let tasks_dir = claude_dir().join("tasks");
    if !tasks_dir.exists() {
        return vec![];
    }

    let entries = match std::fs::read_dir(&tasks_dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut results = Vec::new();

    'outer: for entry in entries.filter_map(|e| e.ok()) {
        let team_dir = entry.path();
        if !team_dir.is_dir() {
            continue;
        }

        let team_id = team_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let task_entries = match std::fs::read_dir(&team_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for task_entry in task_entries.filter_map(|e| e.ok()) {
            if results.len() >= 5 {
                break 'outer;
            }

            let task_path = task_entry.path();
            if task_path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            let content = match std::fs::read_to_string(&task_path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let json: serde_json::Value = match serde_json::from_str(&content) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let subject = json
                .get("subject")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let description = json
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let subject_lc = subject.to_lowercase();
            let desc_lc = description.as_deref().unwrap_or("").to_lowercase();

            if !subject_lc.contains(q) && !desc_lc.contains(q) {
                continue;
            }

            let task_id = task_path
                .file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let team_name = json
                .get("teamName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let status = json
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("pending")
                .to_string();

            results.push(SearchTaskResult {
                id: task_id,
                team_id: team_id.clone(),
                team_name,
                subject,
                description,
                status,
            });
        }
    }

    results
}
