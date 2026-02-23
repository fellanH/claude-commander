use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{CreateProjectInput, Project, SyncResult};
use crate::state::AppState;
use crate::utils::validate_home_path;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

// ─── Identity key helpers ───────────────────────────────────────────────────

/// Derive a stable identity key for a project directory that survives renames
/// and relocations.
///
/// Strategy 1 – git remote origin URL (normalised, prefixed with `git:`).
/// Strategy 2 – UUID stamp written to `.claude-commander-id` in the project
///              root (created on first scan if no git remote is found).
fn compute_identity_key(path: &Path) -> String {
    if let Some(key) = git_remote_identity(path) {
        return key;
    }
    uuid_stamp_identity(path)
}

/// Read the `origin` remote URL from the git repository at `path`, normalise
/// it, and return `"git:<url>"`.  Returns `None` when the directory is not a
/// git repo or has no `origin` remote.
fn git_remote_identity(path: &Path) -> Option<String> {
    let repo = git2::Repository::open(path).ok()?;
    let remote = repo.find_remote("origin").ok()?;
    let url = remote.url()?.trim().to_string();
    // Normalise: strip trailing slash and optional `.git` suffix so that
    // `https://github.com/foo/bar` and `https://github.com/foo/bar.git` map
    // to the same key.
    let normalised = url
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string();
    Some(format!("git:{}", normalised))
}

/// Read a UUID from the `.claude-commander-id` stamp file inside `path`,
/// creating and writing one if the file does not yet exist.  Returns
/// `"stamp:<uuid>"`.
fn uuid_stamp_identity(path: &Path) -> String {
    let stamp_file = path.join(".claude-commander-id");
    if let Ok(content) = std::fs::read_to_string(&stamp_file) {
        let trimmed = content.trim().to_string();
        if !trimmed.is_empty() {
            return format!("stamp:{}", trimmed);
        }
    }
    let id = Uuid::new_v4().to_string();
    // Best-effort write – if the directory is read-only we silently skip.
    let _ = std::fs::write(&stamp_file, &id);
    format!("stamp:{}", id)
}

// ─── Internal DB helpers ────────────────────────────────────────────────────

/// Load all non-archived projects from the DB.
fn load_db_projects(conn: &rusqlite::Connection) -> Result<Vec<Project>, CommanderError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, path, tags, color, sort_order, is_archived, created_at, identity_key
             FROM projects WHERE is_archived = 0",
        )
        .map_err(CommanderError::from)?;

    let projects = stmt
        .query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
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
                identity_key: row.get(8)?,
            })
        })
        .map_err(CommanderError::from)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

/// Update a project's path and name in the DB, first removing any conflicting
/// record that already occupies `new_path` (which would violate the UNIQUE
/// constraint).  The conflicting record is a stale path-only entry for the
/// same project that existed before `identity_key` tracking was introduced.
fn apply_path_update(
    conn: &rusqlite::Connection,
    id: &str,
    new_path: &str,
    new_name: &str,
) -> Result<(), CommanderError> {
    // Delete any phantom record that holds new_path with a different id.
    conn.execute(
        "DELETE FROM projects WHERE path = ?1 AND id != ?2",
        rusqlite::params![new_path, id],
    )
    .map_err(CommanderError::from)?;

    conn.execute(
        "UPDATE projects SET path = ?1, name = ?2 WHERE id = ?3",
        rusqlite::params![new_path, new_name, id],
    )
    .map_err(CommanderError::from)?;

    Ok(())
}

// ─── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_projects(scan_path: Option<String>) -> CmdResult<Vec<Project>> {
    let base = if let Some(ref p) = scan_path {
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

        let has_package_json = path.join("package.json").exists();
        let has_cargo_toml = path.join("Cargo.toml").exists();
        let has_git = path.join(".git").exists();

        if !has_package_json && !has_cargo_toml && !has_git {
            continue;
        }

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

        let identity_key = Some(compute_identity_key(path));

        projects.push(Project {
            id: Uuid::new_v4().to_string(), // placeholder; real ID assigned on upsert
            name,
            path: path.to_string_lossy().to_string(),
            tags: vec![],
            color: None,
            sort_order: 0,
            is_archived: false,
            created_at: chrono::Utc::now().to_rfc3339(),
            identity_key,
        });
    }

    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

/// Atomic, DB-aware sync.  Scans the filesystem then reconciles the results
/// against existing DB records in one pass:
///
/// - **identity_key match, path changed** → rename or relocation detected;
///   path updated in DB, record preserved.
/// - **identity_key match, path same** → no-op, counted as unchanged.
/// - **path match only** → existing record; backfills identity_key if missing.
/// - **no match** → new project; inserted fresh.
#[tauri::command]
pub fn sync_projects(
    state: State<AppState>,
    scan_path: Option<String>,
) -> CmdResult<SyncResult> {
    // Scan filesystem without holding the DB lock.
    let scanned = scan_projects(scan_path.clone())?;

    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let db_projects = load_db_projects(conn).map_err(to_cmd_err)?;

    // Build lookup maps.
    let mut by_identity: HashMap<String, Project> = db_projects
        .iter()
        .filter_map(|p| p.identity_key.as_ref().map(|k| (k.clone(), p.clone())))
        .collect();
    let by_path: HashMap<String, Project> = db_projects
        .iter()
        .map(|p| (p.path.clone(), p.clone()))
        .collect();

    let mut updated: Vec<Project> = Vec::new();
    let mut added: Vec<Project> = Vec::new();
    let mut unchanged_count: usize = 0;
    // Track which DB project IDs were matched so we can detect stale records.
    let mut matched_ids: HashSet<String> = HashSet::new();

    for scanned_proj in &scanned {
        let ident = scanned_proj.identity_key.as_deref();

        // ── 1. Match by identity_key ────────────────────────────────────────
        if let Some(key) = ident {
            if let Some(existing) = by_identity.remove(key) {
                matched_ids.insert(existing.id.clone());
                if existing.path != scanned_proj.path {
                    // Folder was renamed or relocated.
                    apply_path_update(conn, &existing.id, &scanned_proj.path, &scanned_proj.name)
                        .map_err(to_cmd_err)?;
                    updated.push(Project {
                        path: scanned_proj.path.clone(),
                        name: scanned_proj.name.clone(),
                        ..existing
                    });
                } else {
                    unchanged_count += 1;
                }
                continue;
            }
        }

        // ── 2. Match by path ────────────────────────────────────────────────
        if let Some(existing) = by_path.get(&scanned_proj.path) {
            matched_ids.insert(existing.id.clone());
            // Backfill identity_key for records that pre-date #4.
            if let (None, Some(key)) = (&existing.identity_key, ident) {
                conn.execute(
                    "UPDATE projects SET identity_key = ?1 WHERE id = ?2",
                    rusqlite::params![key, existing.id],
                )
                .map_err(|e| to_cmd_err(CommanderError::from(e)))?;
            }
            unchanged_count += 1;
            continue;
        }

        // ── 3. New project ──────────────────────────────────────────────────
        let new_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO projects (id, name, path, tags, identity_key, created_at)
             VALUES (?1, ?2, ?3, '[]', ?4, ?5)",
            rusqlite::params![new_id, scanned_proj.name, scanned_proj.path, ident, now],
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

        added.push(Project {
            id: new_id,
            name: scanned_proj.name.clone(),
            path: scanned_proj.path.clone(),
            tags: vec![],
            color: None,
            sort_order: 0,
            is_archived: false,
            created_at: now,
            identity_key: scanned_proj.identity_key.clone(),
        });
    }

    // ── 4. Archive stale records ─────────────────────────────────────────────
    // Any DB project not matched during the scan is soft-deleted when either:
    //   a) its path no longer exists on disk, OR
    //   b) its path exists but falls outside the current scan root (stale from
    //      a previous scan_path setting or a folder renamed while the app was
    //      closed).
    let scan_base: Option<std::path::PathBuf> = if let Some(ref p) = scan_path {
        validate_home_path(p).ok()
    } else {
        dirs::home_dir().map(|h| h.join("cv"))
    };

    let mut archived_count: usize = 0;
    for proj in &db_projects {
        if matched_ids.contains(&proj.id) {
            continue;
        }
        let path_obj = std::path::Path::new(&proj.path);
        let path_exists = path_obj.exists();
        let within_scan_root = scan_base
            .as_ref()
            .map(|base| path_obj.starts_with(base))
            .unwrap_or(true);

        if !path_exists || !within_scan_root {
            conn.execute(
                "UPDATE projects SET is_archived = 1 WHERE id = ?1",
                [&proj.id],
            )
            .map_err(|e| to_cmd_err(CommanderError::from(e)))?;
            archived_count += 1;
        }
    }

    Ok(SyncResult {
        updated,
        added,
        unchanged_count,
        archived_count,
    })
}

#[tauri::command]
pub fn get_projects(state: State<AppState>) -> CmdResult<Vec<Project>> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, path, tags, color, sort_order, is_archived, created_at, identity_key
             FROM projects WHERE is_archived = 0 ORDER BY sort_order, name",
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let projects = stmt
        .query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
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
                identity_key: row.get(8)?,
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
    validate_home_path(&project.path)?;

    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    // 1. Match by identity_key (survives rename / relocation)
    let by_identity: Option<String> = project
        .identity_key
        .as_deref()
        .and_then(|key| {
            conn.query_row(
                "SELECT id FROM projects WHERE identity_key = ?1",
                [key],
                |row| row.get(0),
            )
            .ok()
        });

    // 2. Fallback: match by path (backwards compat for records without identity_key)
    let by_path: Option<String> = conn
        .query_row(
            "SELECT id FROM projects WHERE path = ?1",
            [&project.path],
            |row| row.get(0),
        )
        .ok();

    let id = by_identity.or(by_path).unwrap_or_else(|| Uuid::new_v4().to_string());

    let tags = project.tags.unwrap_or_default();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

    // Resolve path conflict before upserting (same logic as apply_path_update).
    conn.execute(
        "DELETE FROM projects WHERE path = ?1 AND id != ?2",
        rusqlite::params![project.path, id],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    conn.execute(
        "INSERT INTO projects (id, name, path, tags, color, identity_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
             name         = excluded.name,
             path         = excluded.path,
             tags         = excluded.tags,
             color        = excluded.color,
             identity_key = COALESCE(excluded.identity_key, identity_key)",
        rusqlite::params![id, project.name, project.path, tags_json, project.color, project.identity_key],
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
        identity_key: project.identity_key,
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
pub fn get_archived_projects(state: State<AppState>) -> CmdResult<Vec<Project>> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, path, tags, color, sort_order, is_archived, created_at, identity_key
             FROM projects WHERE is_archived = 1 ORDER BY name",
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let projects = stmt
        .query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                tags,
                color: row.get(4)?,
                sort_order: row.get(5)?,
                is_archived: true,
                created_at: row.get(7)?,
                identity_key: row.get(8)?,
            })
        })
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

#[tauri::command]
pub fn restore_project(state: State<AppState>, project_id: String) -> CmdResult<()> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    conn.execute(
        "UPDATE projects SET is_archived = 0 WHERE id = ?1",
        [&project_id],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(())
}

#[tauri::command]
pub fn purge_archived_projects(state: State<AppState>) -> CmdResult<usize> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;
    let count = conn
        .execute("DELETE FROM projects WHERE is_archived = 1", [])
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;
    Ok(count)
}

#[tauri::command]
pub fn reset_all_projects(state: State<AppState>) -> CmdResult<usize> {
    let db = state.db.lock();
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;
    let count = conn
        .execute("DELETE FROM projects", [])
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;
    Ok(count)
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
