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

#[tauri::command]
pub fn get_libraries(state: State<'_, AppState>) -> Result<Vec<crate::models::LibraryInfo>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, path, is_active, last_scanned_at, total_files, created_at FROM libraries ORDER BY created_at DESC;")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(crate::models::LibraryInfo {
                id: row.get(0)?,
                path: row.get(1)?,
                is_active: row.get::<_, i64>(2)? == 1,
                last_scanned_at: row.get(3)?,
                total_files: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub fn remove_library(state: State<'_, AppState>, library_id: i64) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    conn.execute("DELETE FROM libraries WHERE id = ?1;", rusqlite::params![library_id])
        .map_err(|e| format!("Failed to remove library: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn prune_missing_files(state: State<'_, AppState>) -> Result<u64, String> {
    let db_path = state.db_path.clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = DatabaseManager::open(&db_path)
            .map_err(|e| format!("Failed to open DB: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, file_path FROM media_files;")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        let mut missing_ids = Vec::new();
        for r in rows.flatten() {
            if !std::path::Path::new(&r.1).exists() {
                missing_ids.push(r.0);
            }
        }

        let total_pruned = missing_ids.len() as u64;
        if total_pruned > 0 {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            {
                let mut del_stmt = tx
                    .prepare_cached("DELETE FROM media_files WHERE id = ?1;")
                    .map_err(|e| e.to_string())?;
                for id in missing_ids {
                    let _ = del_stmt.execute(rusqlite::params![id]);
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
        }

        Ok(total_pruned)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }
    }
    Ok(())
}
