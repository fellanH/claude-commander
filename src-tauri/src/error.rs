use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize, Clone)]
#[serde(tag = "code", content = "details")]
pub enum CommanderError {
    #[error("Database error: {reason}")]
    #[serde(rename = "DB_ERROR")]
    DbError { reason: String },

    #[error("File not found: {path}")]
    #[serde(rename = "FILE_NOT_FOUND")]
    FileNotFound { path: String },

    #[error("Parse error: {reason}")]
    #[serde(rename = "PARSE_ERROR")]
    ParseError { reason: String },

    #[error("Git error: {reason}")]
    #[serde(rename = "GIT_ERROR")]
    GitError { reason: String },

    #[error("IO error: {reason}")]
    #[serde(rename = "IO_ERROR")]
    IoError { reason: String },

    #[error("Internal error: {reason}")]
    #[serde(rename = "INTERNAL_ERROR")]
    InternalError { reason: String },
}

impl CommanderError {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| {
            r#"{"code":"INTERNAL_ERROR","details":{"reason":"Failed to serialize error"}}"#
                .to_string()
        })
    }

    pub fn db(e: impl std::fmt::Display) -> Self {
        CommanderError::DbError { reason: e.to_string() }
    }

    pub fn io(e: impl std::fmt::Display) -> Self {
        CommanderError::IoError { reason: e.to_string() }
    }

    pub fn parse(e: impl std::fmt::Display) -> Self {
        CommanderError::ParseError { reason: e.to_string() }
    }

    pub fn git(e: impl std::fmt::Display) -> Self {
        CommanderError::GitError { reason: e.to_string() }
    }

    pub fn internal(e: impl std::fmt::Display) -> Self {
        CommanderError::InternalError { reason: e.to_string() }
    }
}

impl From<rusqlite::Error> for CommanderError {
    fn from(e: rusqlite::Error) -> Self {
        CommanderError::DbError { reason: e.to_string() }
    }
}

impl From<std::io::Error> for CommanderError {
    fn from(e: std::io::Error) -> Self {
        CommanderError::IoError { reason: e.to_string() }
    }
}

impl From<git2::Error> for CommanderError {
    fn from(e: git2::Error) -> Self {
        CommanderError::GitError { reason: e.to_string() }
    }
}

impl From<serde_json::Error> for CommanderError {
    fn from(e: serde_json::Error) -> Self {
        CommanderError::ParseError { reason: e.to_string() }
    }
}

// Tauri requires commands to return Result<T, String>
pub type CmdResult<T> = Result<T, String>;

pub fn to_cmd_err(e: CommanderError) -> String {
    e.to_json()
}
