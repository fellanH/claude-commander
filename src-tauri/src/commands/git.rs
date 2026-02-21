use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{GitBranch, GitCommit, GitFile, GitStatus};
use git2::{Repository, StatusOptions};

#[tauri::command]
pub fn git_status(project_path: String) -> CmdResult<GitStatus> {
    let repo = Repository::discover(&project_path)
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    // Current branch
    let head = repo.head().map_err(|e| to_cmd_err(CommanderError::from(e)))?;
    let branch = head
        .shorthand()
        .unwrap_or("HEAD")
        .to_string();

    // Ahead/behind
    let (ahead, behind) = compute_ahead_behind(&repo, &head);

    // File statuses
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for entry in statuses.iter() {
        let status = entry.status();
        let path = entry
            .path()
            .unwrap_or("")
            .to_string();

        if status.is_wt_new() {
            untracked.push(path);
        } else {
            if status.intersects(
                git2::Status::INDEX_NEW
                    | git2::Status::INDEX_MODIFIED
                    | git2::Status::INDEX_DELETED
                    | git2::Status::INDEX_RENAMED,
            ) {
                staged.push(GitFile {
                    path: path.clone(),
                    status: index_status_str(status),
                });
            }
            if status.intersects(
                git2::Status::WT_MODIFIED
                    | git2::Status::WT_DELETED
                    | git2::Status::WT_RENAMED,
            ) {
                unstaged.push(GitFile {
                    path,
                    status: wt_status_str(status),
                });
            }
        }
    }

    Ok(GitStatus { branch, ahead, behind, staged, unstaged, untracked })
}

#[tauri::command]
pub fn git_log(project_path: String, limit: Option<usize>) -> CmdResult<Vec<GitCommit>> {
    let repo = Repository::discover(&project_path)
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let mut walk = repo
        .revwalk()
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;
    walk.push_head()
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;
    walk.set_sorting(git2::Sort::TIME | git2::Sort::TOPOLOGICAL)
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let limit = limit.unwrap_or(20);
    let mut commits = Vec::new();

    for oid in walk.take(limit) {
        let oid = oid.map_err(|e| to_cmd_err(CommanderError::from(e)))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

        let hash = oid.to_string();
        let short_hash = hash[..7].to_string();
        let message = commit.summary().unwrap_or("").to_string();
        let author = commit.author().name().unwrap_or("Unknown").to_string();
        let timestamp = {
            let t = commit.time();
            let dt = chrono::DateTime::from_timestamp(t.seconds(), 0)
                .unwrap_or_default()
                .with_timezone(&chrono::Utc);
            dt.to_rfc3339()
        };

        commits.push(GitCommit { hash, short_hash, message, author, timestamp });
    }

    Ok(commits)
}

#[tauri::command]
pub fn git_branches(project_path: String) -> CmdResult<Vec<GitBranch>> {
    let repo = Repository::discover(&project_path)
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let branches = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let mut result = Vec::new();
    for branch_res in branches {
        let (branch, _) = branch_res.map_err(|e| to_cmd_err(CommanderError::from(e)))?;
        let name = branch.name().ok().flatten().unwrap_or("").to_string();
        let is_head = head_name.as_deref() == Some(&name);
        let upstream = branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

        result.push(GitBranch { name, is_head, upstream });
    }

    Ok(result)
}

fn compute_ahead_behind(repo: &Repository, head: &git2::Reference) -> (usize, usize) {
    let local_oid = match head.target() {
        Some(o) => o,
        None => return (0, 0),
    };

    let upstream_ref = match head.resolve().ok().and_then(|r| {
        repo.branch_upstream_name(r.name()?).ok()
    }) {
        Some(name) => name,
        None => return (0, 0),
    };

    let upstream_ref_str = match upstream_ref.as_str() {
        Some(s) => s.to_string(),
        None => return (0, 0),
    };

    let upstream_oid = match repo.find_reference(&upstream_ref_str).ok().and_then(|r| r.target()) {
        Some(o) => o,
        None => return (0, 0),
    };

    repo.graph_ahead_behind(local_oid, upstream_oid)
        .unwrap_or((0, 0))
}

fn index_status_str(s: git2::Status) -> String {
    if s.is_index_new() {
        "added"
    } else if s.is_index_deleted() {
        "deleted"
    } else if s.is_index_renamed() {
        "renamed"
    } else {
        "modified"
    }
    .to_string()
}

fn wt_status_str(s: git2::Status) -> String {
    if s.is_wt_deleted() {
        "deleted"
    } else if s.is_wt_renamed() {
        "renamed"
    } else {
        "modified"
    }
    .to_string()
}
