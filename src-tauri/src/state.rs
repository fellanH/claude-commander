use crate::services::file_watcher::ClaudeWatcher;
use parking_lot::Mutex;
use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    pub claude_watcher: Mutex<Option<ClaudeWatcher>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Mutex::new(None),
            claude_watcher: Mutex::new(None),
        }
    }
}
