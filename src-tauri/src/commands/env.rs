use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{DeployConfig, EnvFile, EnvVar};
use std::io::Write;
use std::path::Path;

#[tauri::command]
pub fn list_env_files(project_path: String) -> CmdResult<Vec<EnvFile>> {
    let dir = Path::new(&project_path);
    let mut env_files = Vec::new();

    let patterns = [".env", ".env.local", ".env.development", ".env.production", ".env.test"];

    for name in &patterns {
        let path = dir.join(name);
        if path.exists() {
            let vars = parse_env_file_count(&path);
            env_files.push(EnvFile {
                filename: name.to_string(),
                path: path.to_string_lossy().to_string(),
                var_count: vars,
            });
        }
    }

    // Also check for any other .env.* files
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let fname = entry.file_name();
            let fname_str = fname.to_string_lossy();
            if fname_str.starts_with(".env.")
                && !patterns.iter().any(|p| *p == fname_str.as_ref())
            {
                let path = entry.path();
                let vars = parse_env_file_count(&path);
                env_files.push(EnvFile {
                    filename: fname_str.to_string(),
                    path: path.to_string_lossy().to_string(),
                    var_count: vars,
                });
            }
        }
    }

    env_files.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(env_files)
}

#[tauri::command]
pub fn get_env_vars(env_file_path: String) -> CmdResult<Vec<EnvVar>> {
    let path = Path::new(&env_file_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    let vars = parse_env_content(&content);
    Ok(vars)
}

#[tauri::command]
pub fn set_env_var(env_file_path: String, key: String, value: String) -> CmdResult<()> {
    let path = Path::new(&env_file_path);

    let existing = if path.exists() {
        std::fs::read_to_string(path)
            .map_err(|e| to_cmd_err(CommanderError::io(e)))?
    } else {
        String::new()
    };

    let mut lines: Vec<String> = existing.lines().map(|l| l.to_string()).collect();
    let key_prefix = format!("{}=", key);

    let mut found = false;
    for line in &mut lines {
        if line.starts_with(&key_prefix)
            || line == &key
            || (line.contains('=') && line.split('=').next() == Some(&key))
        {
            *line = format!("{}={}", key, value);
            found = true;
            break;
        }
    }

    if !found {
        lines.push(format!("{}={}", key, value));
    }

    let mut content = lines.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }

    write_file_atomic(path, content)
}

#[tauri::command]
pub fn delete_env_var(env_file_path: String, key: String) -> CmdResult<()> {
    let path = Path::new(&env_file_path);
    if !path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    let key_prefix = format!("{}=", key);
    let filtered: Vec<&str> = content
        .lines()
        .filter(|l| !l.starts_with(&key_prefix) && !(*l == key))
        .collect();

    let mut new_content = filtered.join("\n");
    if !new_content.is_empty() && !new_content.ends_with('\n') {
        new_content.push('\n');
    }

    write_file_atomic(path, new_content)
}

#[tauri::command]
pub fn get_deploy_configs(project_path: String) -> CmdResult<Vec<DeployConfig>> {
    let dir = Path::new(&project_path);
    let mut configs = Vec::new();

    // Fly.io
    let fly_toml = dir.join("fly.toml");
    if fly_toml.exists() {
        if let Ok(content) = std::fs::read_to_string(&fly_toml) {
            if let Ok(val) = content.parse::<toml::Value>() {
                let app_name = val
                    .get("app")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let region = val
                    .get("primary_region")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // Convert TOML to JSON for frontend
                let raw = toml_to_json(val);

                configs.push(DeployConfig {
                    kind: "fly".to_string(),
                    app_name,
                    region,
                    raw,
                });
            }
        }
    }

    // Vercel
    let vercel_json = dir.join("vercel.json");
    if vercel_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&vercel_json) {
            if let Ok(raw) = serde_json::from_str::<serde_json::Value>(&content) {
                let app_name = raw
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                configs.push(DeployConfig {
                    kind: "vercel".to_string(),
                    app_name,
                    region: None,
                    raw,
                });
            }
        }
    }

    Ok(configs)
}

/// Write `content` to `path` atomically using a sibling temp file + rename.
/// On POSIX (macOS/Linux) `std::fs::rename` is atomic within the same filesystem,
/// so readers always see either the old or the new content, never a partial write.
fn write_file_atomic(path: &Path, content: String) -> CmdResult<()> {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| to_cmd_err(CommanderError::internal("env file path has no filename")))?;

    let tmp_path = path.with_file_name(format!("{}.tmp", filename));

    {
        let mut file = std::fs::File::create(&tmp_path)
            .map_err(|e| to_cmd_err(CommanderError::io(e)))?;
        file.write_all(content.as_bytes())
            .map_err(|e| to_cmd_err(CommanderError::io(e)))?;
        file.sync_all()
            .map_err(|e| to_cmd_err(CommanderError::io(e)))?;
    }

    std::fs::rename(&tmp_path, path)
        .map_err(|e| to_cmd_err(CommanderError::io(e)))?;

    Ok(())
}

fn parse_env_content(content: &str) -> Vec<EnvVar> {
    content
        .lines()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
        .filter_map(|line| {
            let eq_pos = line.find('=')?;
            let key = line[..eq_pos].trim().to_string();
            let raw_value = line[eq_pos + 1..].trim().to_string();

            // Strip surrounding quotes
            let value = if (raw_value.starts_with('"') && raw_value.ends_with('"'))
                || (raw_value.starts_with('\'') && raw_value.ends_with('\''))
            {
                raw_value[1..raw_value.len() - 1].to_string()
            } else {
                raw_value
            };

            // Mask secrets-looking vars by default
            let masked = is_secret_key(&key);

            Some(EnvVar { key, value, masked })
        })
        .collect()
}

fn parse_env_file_count(path: &Path) -> usize {
    std::fs::read_to_string(path)
        .map(|c| parse_env_content(&c).len())
        .unwrap_or(0)
}

fn is_secret_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower.contains("secret")
        || lower.contains("password")
        || lower.contains("token")
        || lower.contains("key")
        || lower.contains("api")
        || lower.contains("auth")
        || lower.contains("private")
        || lower.contains("credential")
}

fn toml_to_json(val: toml::Value) -> serde_json::Value {
    match val {
        toml::Value::String(s) => serde_json::Value::String(s),
        toml::Value::Integer(i) => serde_json::Value::Number(i.into()),
        toml::Value::Float(f) => {
            serde_json::Number::from_f64(f)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null)
        }
        toml::Value::Boolean(b) => serde_json::Value::Bool(b),
        toml::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(toml_to_json).collect())
        }
        toml::Value::Table(table) => {
            let map: serde_json::Map<_, _> = table
                .into_iter()
                .map(|(k, v)| (k, toml_to_json(v)))
                .collect();
            serde_json::Value::Object(map)
        }
        toml::Value::Datetime(dt) => serde_json::Value::String(dt.to_string()),
    }
}
