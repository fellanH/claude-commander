use crate::error::CommanderError;
use rusqlite::Connection;
use std::path::Path;

pub fn init_db(path: &Path) -> Result<Connection, CommanderError> {
    let conn = Connection::open(path).map_err(CommanderError::from)?;

    // Wait up to 5 s when another writer holds the lock (WAL mode allows one writer at a time)
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(CommanderError::from)?;

    // Enable WAL mode for better concurrent performance
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(CommanderError::from)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            tags TEXT NOT NULL DEFAULT '[]',
            color TEXT,
            sort_order INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS planning_items (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            subject TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog','todo','in_progress','done')),
            priority INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- TODO: reserved for future encrypted env-var caching feature
        CREATE TABLE IF NOT EXISTS env_var_cache (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            env_file TEXT NOT NULL,
            key TEXT NOT NULL,
            value_encrypted TEXT NOT NULL,
            iv TEXT NOT NULL,
            UNIQUE(project_id, env_file, key)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- TODO: reserved for future session↔project correlation feature
        CREATE TABLE IF NOT EXISTS session_project_links (
            session_id TEXT NOT NULL,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            PRIMARY KEY (session_id, project_id)
        );
        ",
    )
    .map_err(CommanderError::from)?;

    Ok(conn)
}
