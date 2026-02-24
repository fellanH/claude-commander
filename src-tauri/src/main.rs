// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
pub mod error;
pub mod models;
mod pty_state;
mod services;
mod state;
pub mod utils;

use pty_state::PtyState;
use state::AppState;
use tauri::Manager;

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .manage(PtyState::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_state = app_handle.state::<AppState>();

            // Initialize database at ~/.claude-commander/commander.db
            let db_dir = dirs::home_dir()
                .ok_or_else(|| {
                    Box::new(std::io::Error::other("Cannot find home dir"))
                        as Box<dyn std::error::Error>
                })?
                .join(".claude-commander");

            if !db_dir.exists() {
                std::fs::create_dir_all(&db_dir)
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            }

            let db_path = db_dir.join("commander.db");

            match db::init_db(&db_path) {
                Ok(conn) => {
                    let mut db_lock = app_state.db.lock();
                    *db_lock = Some(conn);
                    log::info!("Database initialized at {:?}", db_path);
                }
                Err(e) => {
                    log::error!("Failed to initialize database: {}", e);
                    return Err(Box::new(std::io::Error::other(e.to_string())));
                }
            }

            // Start watching ~/.claude/ for task/plan/session changes
            let claude_dir = dirs::home_dir()
                .map(|h| h.join(".claude"))
                .filter(|p| p.exists());

            if let Some(claude_path) = claude_dir {
                match services::file_watcher::ClaudeWatcher::new(
                    app_handle.clone(),
                    claude_path.clone(),
                ) {
                    Ok(watcher) => {
                        let mut watcher_lock = app_state.claude_watcher.lock();
                        *watcher_lock = Some(watcher);
                        log::info!("Watching {:?} for changes", claude_path);
                    }
                    Err(e) => {
                        log::warn!("Failed to start file watcher: {}", e);
                    }
                }
            }

            // Start watching the project scan path for directory removals.
            // Read scan_path from settings (falls back to ~/cv if not set).
            let scan_path: Option<std::path::PathBuf> = {
                let db_lock = app_state.db.lock();
                db_lock
                    .as_ref()
                    .and_then(|conn| {
                        conn.query_row(
                            "SELECT value FROM settings WHERE key = 'scan_path'",
                            [],
                            |row| row.get::<_, String>(0),
                        )
                        .ok()
                    })
                    .or_else(|| {
                        dirs::home_dir().map(|h| h.join("cv").to_string_lossy().to_string())
                    })
                    .map(std::path::PathBuf::from)
                    .filter(|p| p.exists())
            };

            if let Some(proj_path) = scan_path {
                match services::file_watcher::ProjectWatcher::new(
                    app_handle.clone(),
                    proj_path.clone(),
                ) {
                    Ok(watcher) => {
                        let mut watcher_lock = app_state.project_watcher.lock();
                        *watcher_lock = Some(watcher);
                        log::info!("Watching {:?} for project removals", proj_path);
                    }
                    Err(e) => {
                        log::warn!("Failed to start project watcher: {}", e);
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::projects::scan_projects,
            commands::projects::sync_projects,
            commands::projects::get_projects,
            commands::projects::get_archived_projects,
            commands::projects::restore_project,
            commands::projects::upsert_project,
            commands::projects::delete_project,
            commands::projects::purge_archived_projects,
            commands::projects::reset_all_projects,
            commands::projects::import_scanned_projects,
            // Claude
            commands::claude::read_claude_tasks,
            commands::claude::list_claude_plans,
            commands::claude::read_claude_plan,
            commands::claude::read_claude_sessions,
            commands::claude::read_session_messages,
            commands::claude::read_claude_session,
            // Terminal
            commands::terminal::detect_terminal,
            commands::terminal::launch_claude,
            // Git
            commands::git::git_status,
            commands::git::git_log,
            commands::git::git_branches,
            // Env
            commands::env::list_env_files,
            commands::env::get_env_vars,
            commands::env::set_env_var,
            commands::env::delete_env_var,
            commands::env::get_deploy_configs,
            // Planning
            commands::planning::get_planning_items,
            commands::planning::create_planning_item,
            commands::planning::update_planning_item,
            commands::planning::move_planning_item,
            commands::planning::delete_planning_item,
            // GitHub
            commands::github::detect_github_repo,
            commands::github::create_github_issue,
            commands::github::close_github_issue,
            commands::github::fetch_issue_states,
            commands::github::upsert_task_github_link,
            commands::github::get_task_github_links,
            commands::github::delete_task_github_link,
            // Search
            commands::search::global_search,
            // Settings
            commands::settings::get_settings,
            commands::settings::update_settings,
            // PTY (in-app terminal)
            commands::pty::pty_create,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
