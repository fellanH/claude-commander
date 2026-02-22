use crate::error::{to_cmd_err, CmdResult, CommanderError};

/// Validate that `path` is within the user's home directory.
/// Accepts both existing and not-yet-existing paths (for files about to be created):
/// if the path itself doesn't exist, the parent directory is canonicalized instead.
pub fn validate_home_path(path: &str) -> CmdResult<std::path::PathBuf> {
    let p = std::path::Path::new(path);

    // Try full canonicalization first; fall back to canonicalizing the parent
    // so that paths for files that don't exist yet (e.g. new .env files) still work.
    let canonical = p
        .canonicalize()
        .or_else(|_| {
            let parent = p.parent().unwrap_or(p);
            let canon_parent = parent.canonicalize()?;
            let name = p.file_name().unwrap_or_default();
            Ok::<_, std::io::Error>(canon_parent.join(name))
        })
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    let home = dirs::home_dir()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("Cannot determine home dir")))?;

    if !canonical.starts_with(&home) {
        return Err(to_cmd_err(CommanderError::internal(
            "Path must be within home directory",
        )));
    }

    Ok(canonical)
}
