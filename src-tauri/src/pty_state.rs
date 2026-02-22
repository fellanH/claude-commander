use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::Mutex;

pub struct PtySession {
    pub writer: Box<dyn std::io::Write + Send>,
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
}

pub struct PtyState {
    pub sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}
