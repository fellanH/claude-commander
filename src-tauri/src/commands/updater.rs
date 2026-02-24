use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::error::{to_cmd_err, CmdResult, CommanderError};

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub body: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> CmdResult<UpdateInfo> {
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateInfo {
            available: true,
            version: Some(update.version.clone()),
            body: update.body.clone(),
        }),
        Ok(None) => Ok(UpdateInfo {
            available: false,
            version: None,
            body: None,
        }),
        Err(e) => Err(to_cmd_err(CommanderError::internal(e))),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> CmdResult<()> {
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;

    let update = updater
        .check()
        .await
        .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;

    if let Some(update) = update {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| to_cmd_err(CommanderError::internal(e)))?;

        app.restart();
    }

    Ok(())
}
