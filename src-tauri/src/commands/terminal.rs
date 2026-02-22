use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::utils::validate_home_path;
use std::io::Write;

#[derive(serde::Serialize)]
pub struct TerminalInfo {
    pub detected: String,
    pub available: Vec<String>,
}

#[tauri::command]
pub fn detect_terminal() -> CmdResult<TerminalInfo> {
    let mut available = Vec::new();

    if std::path::Path::new("/Applications/Warp.app").exists() {
        available.push("warp".to_string());
    }
    if std::path::Path::new("/Applications/iTerm.app").exists() {
        available.push("iterm2".to_string());
    }
    // Terminal.app is always available on macOS
    available.push("terminal".to_string());

    let detected = available.first().cloned().unwrap_or_else(|| "terminal".to_string());

    Ok(TerminalInfo { detected, available })
}

#[tauri::command]
pub fn launch_claude(project_path: String, terminal: Option<String>) -> CmdResult<()> {
    // Validate that project_path is within the user's home directory
    validate_home_path(&project_path)?;

    let terminal = terminal.unwrap_or_else(|| {
        if std::path::Path::new("/Applications/Warp.app").exists() {
            "warp".to_string()
        } else if std::path::Path::new("/Applications/iTerm.app").exists() {
            "iterm2".to_string()
        } else {
            "terminal".to_string()
        }
    });

    // Find claude binary — common install locations as fallback
    let claude_bin = which::which("claude")
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| {
            // Check well-known install locations before giving up
            let candidates = [
                "/usr/local/bin/claude",
                "/opt/homebrew/bin/claude",
                "/usr/bin/claude",
            ];
            candidates
                .iter()
                .find(|&&p| std::path::Path::new(p).exists())
                .map(|&p| p.to_string())
                .unwrap_or_else(|| "claude".to_string())
        });

    match terminal.as_str() {
        "iterm2" => launch_via_script(&project_path, &claude_bin, "iTerm"),
        "terminal" => launch_via_script(&project_path, &claude_bin, "Terminal"),
        "warp" => {
            // Warp supports opening via URL scheme
            let cmd = format!("cd {} && {}", shell_quote(&project_path), shell_quote(&claude_bin));
            let encoded = urlencoding_simple(&cmd);
            open_url(&format!("warp://action/new_tab?command={}", encoded))
        }
        _ => Err(to_cmd_err(CommanderError::internal(format!("Unknown terminal: {terminal}")))),
    }
}

/// Write a temp .command script and open it with the given terminal app.
/// Avoids AppleScript/Automation permission entirely — `open` requires no TCC entitlement.
fn launch_via_script(project_path: &str, claude_bin: &str, terminal_app: &str) -> CmdResult<()> {
    let script = format!(
        "#!/bin/bash\n\
         export PATH=\"$PATH:/usr/local/bin:/opt/homebrew/bin\"\n\
         cd {}\n\
         {}\n",
        shell_quote(project_path),
        shell_quote(claude_bin),
    );

    // Use tempfile for a unique, race-free script path (no predictable name to exploit)
    let mut temp = tempfile::Builder::new()
        .suffix(".command")
        .tempfile()
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    temp.write_all(script.as_bytes())
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;
    temp.flush()
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    // Keep the file on disk past the tempfile lifetime so Terminal.app can read it
    let tmp_path = temp
        .into_temp_path()
        .keep()
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    std::process::Command::new("chmod")
        .args(["755", &tmp_path.to_string_lossy()])
        .output()
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    let output = std::process::Command::new("open")
        .args(["-a", terminal_app, &tmp_path.to_string_lossy()])
        .output()
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(to_cmd_err(CommanderError::internal(format!(
            "Failed to open {terminal_app}: {stderr}"
        ))));
    }

    // Deferred cleanup: give Terminal.app 5 s to read the script before we delete it
    let tmp_path_cleanup = tmp_path.to_path_buf();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        let _ = std::fs::remove_file(&tmp_path_cleanup);
    });

    Ok(())
}

/// POSIX single-quote a string for use in shell commands.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn open_url(url: &str) -> CmdResult<()> {
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;
    Ok(())
}

/// Simple percent-encoding for URL parameters (only ASCII safe chars pass through)
fn urlencoding_simple(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                (b as char).to_string()
            } else {
                format!("%{:02X}", b)
            }
        })
        .collect()
}
