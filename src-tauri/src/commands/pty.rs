use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::pty_state::{PtySession, PtyState};
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Emitter;

#[derive(Clone, serde::Serialize)]
pub struct PtyOutputPayload {
    pub pty_id: String,
    pub data: Vec<u8>,
}

#[derive(Clone, serde::Serialize)]
pub struct PtyExitPayload {
    pub pty_id: String,
}

const MAX_ROWS: u16 = 500;
const MAX_COLS: u16 = 500;

#[tauri::command]
pub fn pty_create(
    project_path: String,
    cols: u16,
    rows: u16,
    app_handle: tauri::AppHandle,
    pty_state: tauri::State<'_, PtyState>,
) -> CmdResult<String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::Read;

    if rows == 0 || cols == 0 || rows > MAX_ROWS || cols > MAX_COLS {
        return Err(to_cmd_err(CommanderError::internal(format!(
            "Invalid PTY dimensions: {}x{} (max {}x{})",
            cols, rows, MAX_COLS, MAX_ROWS
        ))));
    }

    // Resolve binary: look for claude, fall back to $SHELL, then /bin/zsh
    let program = which::which("claude")
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| {
            ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"]
                .iter()
                .find(|&&p| std::path::Path::new(p).exists())
                .map(|&s| s.to_string())
                .unwrap_or_else(|| {
                    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
                })
        });

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;

    let mut cmd = CommandBuilder::new(&program);
    cmd.cwd(&project_path);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Augment PATH so Homebrew tools are visible even without login shell
    let base_path = std::env::var("PATH").unwrap_or_default();
    cmd.env(
        "PATH",
        format!("{base_path}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"),
    );

    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;

    let pty_id = uuid::Uuid::new_v4().to_string();
    let pty_id_clone = pty_id.clone();

    // Reader thread — emits pty-output events; exits on EOF/error
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app_handle.emit(
                        "pty-exit",
                        PtyExitPayload {
                            pty_id: pty_id_clone.clone(),
                        },
                    );
                    break;
                }
                Ok(n) => {
                    let _ = app_handle.emit(
                        "pty-output",
                        PtyOutputPayload {
                            pty_id: pty_id_clone.clone(),
                            data: buf[..n].to_vec(),
                        },
                    );
                }
            }
        }
    });

    let master = Arc::new(Mutex::new(pair.master));

    pty_state
        .sessions
        .lock()
        .insert(pty_id.clone(), PtySession { writer, master });

    Ok(pty_id)
}

#[tauri::command]
pub fn pty_write(
    pty_id: String,
    data: Vec<u8>,
    pty_state: tauri::State<'_, PtyState>,
) -> CmdResult<()> {
    use std::io::Write;
    let mut sessions = pty_state.sessions.lock();
    let s = sessions
        .get_mut(&pty_id)
        .ok_or_else(|| to_cmd_err(CommanderError::internal("no pty")))?;
    s.writer
        .write_all(&data)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;
    s.writer
        .flush()
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    pty_id: String,
    cols: u16,
    rows: u16,
    pty_state: tauri::State<'_, PtyState>,
) -> CmdResult<()> {
    use portable_pty::PtySize;
    let sessions = pty_state.sessions.lock();
    let s = sessions
        .get(&pty_id)
        .ok_or_else(|| to_cmd_err(CommanderError::internal("no pty")))?;
    s.master
        .lock()
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(pty_id: String, pty_state: tauri::State<'_, PtyState>) -> CmdResult<()> {
    // Removing + dropping the session closes the master fd → kernel sends SIGHUP to child
    pty_state.sessions.lock().remove(&pty_id);
    Ok(())
}
