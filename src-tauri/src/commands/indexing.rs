use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::db::{DatabaseManager, MediaRepository};
use crate::indexer::IndexingPipeline;
use crate::models::IndexingProgressEvent;

pub struct AppState {
    pub db_path: PathBuf,
    pub cancel_token: Arc<AtomicBool>,
}

#[tauri::command]
pub async fn start_indexing(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<u64, String> {
    state.cancel_token.store(false, Ordering::Relaxed);
    let cancel = state.cancel_token.clone();
    let db_path = state.db_path.clone();

    // Spawn background task to avoid blocking the Tauri main IPC thread
    tokio::task::spawn_blocking(move || {
        let mut conn = DatabaseManager::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

        // Ensure library row exists
        conn.execute(
            "INSERT OR IGNORE INTO libraries (path, created_at) VALUES (?1, ?2);",
            rusqlite::params![folder_path, chrono::Utc::now().timestamp_millis()],
        ).map_err(|e| e.to_string())?;

        let library_id: i64 = conn.query_row(
            "SELECT id FROM libraries WHERE path = ?1;",
            rusqlite::params![folder_path],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        let pipeline = IndexingPipeline::new(500);

        let app_handle = app.clone();
        let count = pipeline.run(
            library_id,
            &folder_path,
            &mut conn,
            cancel,
            move |progress: IndexingProgressEvent| {
                let _ = app_handle.emit("indexing-progress", progress);
            },
        )?;

        // Update library statistics
        let _ = conn.execute(
            "UPDATE libraries SET last_scanned_at = ?1, total_files = (SELECT count(*) FROM media_files WHERE library_id = ?2) WHERE id = ?2;",
            rusqlite::params![chrono::Utc::now().timestamp_millis(), library_id],
        );

        Ok(count)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn cancel_indexing(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_token.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn get_total_media_count(state: State<'_, AppState>) -> Result<i64, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::count_total(&conn).map_err(|e| e.to_string())
}
