use crate::error::{to_cmd_err, CmdResult, CommanderError};
use crate::models::{
    CreatePlanningItemInput, PlanningItem, PlanningStatus, UpdatePlanningItemInput,
};
use crate::state::AppState;
use tauri::State;
use uuid::Uuid;

fn parse_status(s: &str) -> PlanningStatus {
    match s {
        "todo" => PlanningStatus::Todo,
        "in_progress" => PlanningStatus::InProgress,
        "done" => PlanningStatus::Done,
        _ => PlanningStatus::Backlog,
    }
}

fn row_to_item(row: &rusqlite::Row) -> rusqlite::Result<PlanningItem> {
    let status_str: String = row.get(4)?;
    Ok(PlanningItem {
        id: row.get(0)?,
        project_id: row.get(1)?,
        subject: row.get(2)?,
        description: row.get(3)?,
        status: parse_status(&status_str),
        priority: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

#[tauri::command]
pub fn get_planning_items(
    state: State<AppState>,
    project_id: String,
) -> CmdResult<Vec<PlanningItem>> {
    let db = state
        .db
        .lock()
        .map_err(|_| to_cmd_err(CommanderError::internal("DB lock failed")))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, subject, description, status, priority, sort_order, \
             created_at, updated_at \
             FROM planning_items WHERE project_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let items = stmt
        .query_map([&project_id], row_to_item)
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

#[tauri::command]
pub fn create_planning_item(
    state: State<AppState>,
    item: CreatePlanningItemInput,
) -> CmdResult<PlanningItem> {
    let db = state
        .db
        .lock()
        .map_err(|_| to_cmd_err(CommanderError::internal("DB lock failed")))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    let max_sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM planning_items \
             WHERE project_id = ?1 AND status = ?2",
            rusqlite::params![item.project_id, item.status],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let sort_order = max_sort + 1000;

    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO planning_items (id, project_id, subject, description, status, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            id,
            item.project_id,
            item.subject,
            item.description,
            item.status,
            sort_order
        ],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let result = conn
        .query_row(
            "SELECT id, project_id, subject, description, status, priority, sort_order, \
             created_at, updated_at FROM planning_items WHERE id = ?1",
            [&id],
            row_to_item,
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(result)
}

#[tauri::command]
pub fn update_planning_item(
    state: State<AppState>,
    item: UpdatePlanningItemInput,
) -> CmdResult<PlanningItem> {
    let db = state
        .db
        .lock()
        .map_err(|_| to_cmd_err(CommanderError::internal("DB lock failed")))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    conn.execute(
        "UPDATE planning_items SET subject = ?1, description = ?2, \
         updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![item.subject, item.description, item.id],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    let result = conn
        .query_row(
            "SELECT id, project_id, subject, description, status, priority, sort_order, \
             created_at, updated_at FROM planning_items WHERE id = ?1",
            [&item.id],
            row_to_item,
        )
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(result)
}

#[tauri::command]
pub fn move_planning_item(
    state: State<AppState>,
    id: String,
    status: String,
    sort_order: i64,
) -> CmdResult<()> {
    let db = state
        .db
        .lock()
        .map_err(|_| to_cmd_err(CommanderError::internal("DB lock failed")))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    conn.execute(
        "UPDATE planning_items SET status = ?1, sort_order = ?2, \
         updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![status, sort_order, id],
    )
    .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(())
}

#[tauri::command]
pub fn delete_planning_item(state: State<AppState>, id: String) -> CmdResult<()> {
    let db = state
        .db
        .lock()
        .map_err(|_| to_cmd_err(CommanderError::internal("DB lock failed")))?;
    let conn = db
        .as_ref()
        .ok_or_else(|| to_cmd_err(CommanderError::internal("DB not initialized")))?;

    conn.execute("DELETE FROM planning_items WHERE id = ?1", [&id])
        .map_err(|e| to_cmd_err(CommanderError::from(e)))?;

    Ok(())
}
