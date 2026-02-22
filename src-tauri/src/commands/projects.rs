use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{CreateProjectInput, Project};
use crate::state::AppState;
use crate::utils::validate_home_path;
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

#[tauri::command]
pub fn scan_projects(scan_path: Option<String>) -> CmdResult<Vec<Project>> {
    let base = if let Some(ref p) = scan_path {
        // Validate user-supplied path is within home directory
        validate_home_path(p)?
    } else {
        dirs::home_dir()
            .map(|h| h.join("cv"))
            .ok_or_else(|| to_cmd_err(CommanderError::internal("Cannot determine scan path")))?
    };

    if !base.exists() {
        return Ok(vec![]);
    }

    let mut projects = Vec::new();

    for entry in WalkDir::new(&base)
        .min_depth(1)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
    {
        let path = entry.path();

        // Check for project markers
        let has_package_json = path.join("package.json").exists();
        let has_cargo_toml = path.join("Cargo.toml").exists();
        let has_git = path.join(".git").exists();

        if !has_package_json && !has_cargo_toml && !has_git {
            continue;
        }

        // Skip node_modules, .git, target directories
        let path_str = path.to_string_lossy();
        if path_str.contains("node_modules")
            || path_str.contains("/.git")
            || path_str.contains("/target")
            || path_str.contains("/.cargo")
        {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let id = Uuid::new_v4().to_string();

        projects.push(Project {
            id,
            name,
            path: path.to_string_lossy().to_string(),
            tags: vec![],
            color: None,
            sort_order: 0,
            is_archived: false,
            created_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

#[tauri::command]
pub fn get_projects(state: State<AppState>) -> CmdResult<Vec<Project>> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, path, tags, color, sort_order, is_archived, created_at
             FROM projects WHERE is_archived = 0 ORDER BY sort_order, name",
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let projects = stmt
        .query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> =
                serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                tags,
                color: row.get(4)?,
                sort_order: row.get(5)?,
                is_archived: {
                    let v: i64 = row.get(6)?;
                    v != 0
                },
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

#[tauri::command]
pub fn upsert_project(
    state: State<AppState>,
    project: CreateProjectInput,
) -> CmdResult<Project> {
    // Validate that the project path is within the user's home directory
    validate_home_path(&project.path)?;

    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    // Check if exists by path
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM projects WHERE path = ?1",
            [&project.path],
            |row| row.get(0),
        )
        .ok();

    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    let tags = project.tags.unwrap_or_default();
    let tags_json =
        serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO projects (id, name, path, tags, color) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(path) DO UPDATE SET name=excluded.name, tags=excluded.tags, color=excluded.color",
        rusqlite::params![id, project.name, project.path, tags_json, project.color],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(Project {
        id,
        name: project.name,
        path: project.path,
        tags,
        color: project.color,
        sort_order: 0,
        is_archived: false,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn delete_project(state: State<AppState>, project_id: String) -> CmdResult<()> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    conn.execute("DELETE FROM projects WHERE id = ?1", [&project_id])
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(())
}

#[tauri::command]
pub fn import_scanned_projects(
    state: State<AppState>,
    projects: Vec<CreateProjectInput>,
) -> CmdResult<Vec<Project>> {
    let mut imported = Vec::new();
    for p in projects {
        if let Ok(proj) = upsert_project(state.clone(), p) {
            imported.push(proj);
        }
    }
    Ok(imported)
}
