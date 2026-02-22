use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const DEBOUNCE_MS: u64 = 500;

pub const EVENT_TASKS_CHANGED: &str = "claude-tasks-changed";
pub const EVENT_PLANS_CHANGED: &str = "claude-plans-changed";
pub const EVENT_SESSIONS_CHANGED: &str = "claude-sessions-changed";

pub struct ClaudeWatcher {
    _watcher: notify::RecommendedWatcher,
    /// Dropping this sender signals the debounce thread to exit.
    _stop_tx: std::sync::mpsc::SyncSender<()>,
}

impl ClaudeWatcher {
    pub fn new(app_handle: AppHandle, watch_path: PathBuf) -> Result<Self, notify::Error> {
        let pending_events: Arc<Mutex<HashMap<PathBuf, Instant>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let pending_clone = pending_events.clone();
        let app_clone = app_handle.clone();

        // Shutdown channel — dropping the sender causes the receiver to see Disconnected
        let (stop_tx, stop_rx) = std::sync::mpsc::sync_channel::<()>(0);

        // Debounce processor thread
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(100));

            // Exit when the watcher is dropped
            match stop_rx.try_recv() {
                Ok(_) | Err(std::sync::mpsc::TryRecvError::Disconnected) => break,
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
            }

            let now = Instant::now();
            let mut to_emit = Vec::new();

            if let Ok(mut pending) = pending_clone.lock() {
                pending.retain(|path, timestamp| {
                    if now.duration_since(*timestamp) >= Duration::from_millis(DEBOUNCE_MS) {
                        to_emit.push(path.clone());
                        false
                    } else {
                        true
                    }
                });
            }

            for path in to_emit {
                let path_str = path.to_string_lossy().to_string();
                // Determine what changed based on path
                if path_str.contains("tasks") {
                    let _ = app_clone.emit(EVENT_TASKS_CHANGED, &path_str);
                } else if path_str.contains("plans") {
                    let _ = app_clone.emit(EVENT_PLANS_CHANGED, &path_str);
                } else if path_str.contains("projects") {
                    let _ = app_clone.emit(EVENT_SESSIONS_CHANGED, &path_str);
                }
            }
        });

        let pending_for_handler = pending_events.clone();

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    return;
                }

                for path in &event.paths {
                    // Only watch .json and .jsonl and .md files
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if matches!(ext, "json" | "jsonl" | "md") {
                            if let Ok(mut pending) = pending_for_handler.lock() {
                                pending.insert(path.clone(), Instant::now());
                            }
                        }
                    }
                }
            }
        })?;

        watcher.watch(&watch_path, RecursiveMode::Recursive)?;

        Ok(Self {
            _watcher: watcher,
            _stop_tx: stop_tx,
        })
    }
}
