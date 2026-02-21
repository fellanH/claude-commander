use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::AppSettings;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> CmdResult<AppSettings> {
    let db = state.db.lock().map_err(|_| {
        to_cmd_err(CommanderError::internal("DB lock failed"))
    })?;
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let defaults = AppSettings::default();

    let scan_path = get_setting(conn, "scan_path")
        .unwrap_or(defaults.scan_path.clone());
    let theme = get_setting(conn, "theme")
        .unwrap_or(Some(defaults.theme.clone()))
        .unwrap_or(defaults.theme.clone());
    let terminal = get_setting(conn, "terminal")
        .unwrap_or(Some(defaults.terminal.clone()))
        .unwrap_or(defaults.terminal.clone());
    let onboarding_completed = get_setting(conn, "onboarding_completed")
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(AppSettings { scan_path, theme, terminal, onboarding_completed })
}

#[tauri::command]
pub fn update_settings(state: State<AppState>, settings: AppSettings) -> CmdResult<()> {
    let db = state.db.lock().map_err(|_| {
        to_cmd_err(CommanderError::internal("DB lock failed"))
    })?;
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    if let Some(path) = &settings.scan_path {
        set_setting(conn, "scan_path", path)?;
    }
    set_setting(conn, "theme", &settings.theme)?;
    set_setting(conn, "terminal", &settings.terminal)?;
    set_setting(conn, "onboarding_completed",
        if settings.onboarding_completed { "true" } else { "false" })?;

    Ok(())
}

fn get_setting(conn: &rusqlite::Connection, key: &str) -> Option<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .map(Some)
}

fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> CmdResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, value],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;
    Ok(())
}
