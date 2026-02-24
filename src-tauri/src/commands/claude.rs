use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{
    ClaudePlan, ClaudeSession, ClaudeTask, ClaudeTaskFile, SessionDetail, SessionMessage,
    SessionToolCall, SessionTurn,
};
use std::path::PathBuf;

fn claude_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".claude")
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn read_claude_tasks() -> CmdResult<Vec<ClaudeTaskFile>> {
    let tasks_dir = claude_dir().join("tasks");
    if !tasks_dir.exists() {
        return Ok(vec![]);
    }

    let mut task_files = Vec::new();

    let entries = std::fs::read_dir(&tasks_dir)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let team_dir = entry.path();
        if !team_dir.is_dir() {
            continue;
        }

        let team_id = team_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let mut tasks = Vec::new();

        let task_entries = match std::fs::read_dir(&team_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for task_entry in task_entries.filter_map(|e| e.ok()) {
            let task_path = task_entry.path();
            if task_path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            let content = match std::fs::read_to_string(&task_path) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!("failed to read task file {}: {}", task_path.display(), e);
                    continue;
                }
            };

            // Parse the task JSON — Claude Code task format
            let json: serde_json::Value = match serde_json::from_str(&content) {
                Ok(v) => v,
                Err(e) => {
                    log::warn!("skipped malformed task file {}: {}", task_path.display(), e);
                    continue;
                }
            };

            let task = ClaudeTask {
                id: task_path
                    .file_stem()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string(),
                team_name: json.get("teamName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                subject: json
                    .get("subject")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Task")
                    .to_string(),
                description: json
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                status: json
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("pending")
                    .to_string(),
                owner: json.get("owner").and_then(|v| v.as_str()).map(|s| s.to_string()),
                active_form: json
                    .get("activeForm")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                created_at: json
                    .get("createdAt")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                updated_at: json
                    .get("updatedAt")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            };

            tasks.push(task);
        }

        task_files.push(ClaudeTaskFile { team_id, tasks });
    }

    Ok(task_files)
}

// ─── Plans ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_claude_plans() -> CmdResult<Vec<ClaudePlan>> {
    let plans_dir = claude_dir().join("plans");
    if !plans_dir.exists() {
        return Ok(vec![]);
    }

    let mut plans = Vec::new();

    let entries = std::fs::read_dir(&plans_dir)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    for entry in entries.filter_map(|e| e.ok()) {
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

        // Extract title from first # heading
        let title = content
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l.trim_start_matches("# ").to_string())
            .unwrap_or_else(|| filename.trim_end_matches(".md").to_string());

        // Preview: first 200 non-heading chars
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

        plans.push(ClaudePlan {
            id: filename.trim_end_matches(".md").to_string(),
            filename,
            title,
            preview,
            content,
            modified_at,
        });
    }

    // Sort by modified_at descending
    plans.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(plans)
}

#[tauri::command]
pub fn read_claude_plan(filename: String) -> CmdResult<String> {
    let path = claude_dir().join("plans").join(&filename);
    std::fs::read_to_string(&path)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))
}

// ─── Sessions ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn read_claude_sessions() -> CmdResult<Vec<ClaudeSession>> {
    let projects_dir = claude_dir().join("projects");
    if !projects_dir.exists() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();

    let entries = std::fs::read_dir(&projects_dir)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let project_dir = entry.path();
        if !project_dir.is_dir() {
            continue;
        }

        let project_key = project_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Each .jsonl file is a session
        let session_entries = match std::fs::read_dir(&project_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for session_entry in session_entries.filter_map(|e| e.ok()) {
            let session_path = session_entry.path();
            if session_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }

            let session_id = session_path
                .file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // Read first line to get cwd
            let cwd = read_first_line_cwd(&session_path);

            // Count messages
            let message_count = count_jsonl_lines(&session_path);

            // Last modified
            let last_message_at = session_path
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                });

            sessions.push(ClaudeSession {
                id: session_id,
                project_key: project_key.clone(),
                cwd,
                message_count,
                last_message_at,
                project_id: None, // correlated on the frontend
            });
        }
    }

    // Sort by last activity
    sessions.sort_by(|a, b| b.last_message_at.cmp(&a.last_message_at));
    Ok(sessions)
}

#[tauri::command]
pub fn read_session_messages(
    project_key: String,
    session_id: String,
) -> CmdResult<Vec<SessionMessage>> {
    let path = claude_dir()
        .join("projects")
        .join(&project_key)
        .join(format!("{}.jsonl", session_id));

    use std::io::BufRead;
    let file = std::fs::File::open(&path)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    let messages = std::io::BufReader::new(file)
        .lines()
        .filter_map(|l| l.ok())
        .filter_map(|line| {
            let v: serde_json::Value = serde_json::from_str(&line).ok()?;
            let msg_type = v["type"].as_str()?;
            let timestamp = v["timestamp"].as_str().unwrap_or("").to_string();
            let uuid = v["uuid"].as_str().unwrap_or("").to_string();
            let message = &v["message"];

            let content = match msg_type {
                "user" => message["content"].as_str()?.to_string(),
                "assistant" => {
                    message["content"]
                        .as_array()?
                        .iter()
                        .filter(|b| b["type"].as_str() == Some("text"))
                        .filter_map(|b| b["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("")
                }
                _ => return None,
            };

            if content.is_empty() {
                return None;
            }

            Some(SessionMessage {
                uuid,
                role: msg_type.to_string(),
                content,
                timestamp,
            })
        })
        .collect();

    Ok(messages)
}

/// Parse a JSONL session file and return typed turns (capped at 500).
#[tauri::command]
pub fn read_claude_session(
    project_key: String,
    session_id: String,
) -> CmdResult<SessionDetail> {
    let path = claude_dir()
        .join("projects")
        .join(&project_key)
        .join(format!("{}.jsonl", session_id));

    use std::io::BufRead;
    let file = std::fs::File::open(&path)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    const MAX_TURNS: usize = 500;

    let lines: Vec<String> = std::io::BufReader::new(file)
        .lines()
        .filter_map(|l| l.ok())
        .filter(|l| !l.trim().is_empty())
        .collect();

    let total_count = lines.len();

    let turns: Vec<SessionTurn> = lines
        .into_iter()
        .take(MAX_TURNS)
        .filter_map(|line| parse_session_turn(&line))
        .collect();

    Ok(SessionDetail { turns, total_count })
}

fn parse_session_turn(line: &str) -> Option<SessionTurn> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;

    let msg_type = v["type"].as_str()?;
    // Only process "user" and "assistant" message types
    if msg_type != "user" && msg_type != "assistant" {
        return None;
    }

    let uuid = v["uuid"].as_str().unwrap_or("").to_string();
    let timestamp = v["timestamp"].as_str().unwrap_or("").to_string();
    let message = &v["message"];
    let role = msg_type.to_string();

    match msg_type {
        "user" => {
            // User content can be a plain string or an array of content blocks
            let content = match &message["content"] {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Array(blocks) => {
                    // Collect text blocks; skip tool_result blocks for the text field
                    blocks
                        .iter()
                        .filter(|b| b["type"].as_str() == Some("text"))
                        .filter_map(|b| b["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("")
                }
                _ => return None,
            };

            if content.is_empty() {
                // May still be a tool_result only turn — skip silently
                return None;
            }

            Some(SessionTurn {
                uuid,
                role,
                content,
                timestamp,
                tool_calls: vec![],
            })
        }
        "assistant" => {
            let blocks = message["content"].as_array()?;

            // Extract plain text from text blocks
            let content: String = blocks
                .iter()
                .filter(|b| b["type"].as_str() == Some("text"))
                .filter_map(|b| b["text"].as_str())
                .collect::<Vec<_>>()
                .join("");

            // Extract tool_use blocks
            let tool_calls: Vec<SessionToolCall> = blocks
                .iter()
                .filter(|b| b["type"].as_str() == Some("tool_use"))
                .map(|b| {
                    let id = b["id"].as_str().unwrap_or("").to_string();
                    let name = b["name"].as_str().unwrap_or("unknown").to_string();
                    let input = serde_json::to_string(&b["input"])
                        .unwrap_or_else(|_| "{}".to_string());
                    SessionToolCall {
                        id,
                        name,
                        input,
                        output: None,
                    }
                })
                .collect();

            // Skip turns that have neither text nor tool calls
            if content.is_empty() && tool_calls.is_empty() {
                return None;
            }

            Some(SessionTurn {
                uuid,
                role,
                content,
                timestamp,
                tool_calls,
            })
        }
        _ => None,
    }
}

fn read_first_line_cwd(path: &std::path::Path) -> Option<String> {
    use std::io::BufRead;
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);
    let first_line = reader.lines().next()?.ok()?;
    let json: serde_json::Value = serde_json::from_str(&first_line).ok()?;
    json.get("cwd")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn count_jsonl_lines(path: &std::path::Path) -> usize {
    use std::io::BufRead;
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 0,
    };
    std::io::BufReader::new(file).lines().count()
}
