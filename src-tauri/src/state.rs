use crate::services::file_watcher::{ClaudeWatcher, ProjectWatcher};
use parking_lot::Mutex;
use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    pub claude_watcher: Mutex<Option<ClaudeWatcher>>,
    pub project_watcher: Mutex<Option<ProjectWatcher>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Mutex::new(None),
            claude_watcher: Mutex::new(None),
            project_watcher: Mutex::new(None),
        }
    }
}
