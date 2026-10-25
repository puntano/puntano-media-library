use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::db::{DatabaseManager, MediaRepository};
use crate::indexer::IndexingPipeline;
use crate::models::IndexingProgressEvent;

pub struct AppState {
    pub db_path: PathBuf,
    /// Signals background daemons (ThumbnailWorker, LibraryWatcher) to exit on app shutdown.
    pub shutdown_token: Arc<AtomicBool>,
    /// Signals only the currently running IndexingPipeline scan to abort.
    pub indexing_cancel_token: Arc<AtomicBool>,
    /// Prevents concurrent full-directory indexing pipelines from racing.
    pub is_indexing_active: Arc<AtomicBool>,
    /// Tracks file hashes whose thumbnail generation failed in the current session.
    pub failed_hashes: Arc<std::sync::RwLock<std::collections::HashSet<String>>>,
    pub watcher_tx: std::sync::Mutex<std::sync::mpsc::Sender<crate::indexer::WatcherCommand>>,
}

struct IndexingActiveGuard(Arc<AtomicBool>);

impl Drop for IndexingActiveGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn start_indexing(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<u64, String> {
    log::info!("Received indexing request for folder: '{}'", folder_path);

    // Validate and sanitize the directory path up-front
    let validated_dir = crate::indexer::walker::DirectoryWalker::validate_root_directory(&folder_path)
        .map_err(|e| {
            log::error!("Directory validation failed for '{}': {}", folder_path, e);
            e
        })?;
    let canonical_path_str = validated_dir.to_string_lossy().to_string();

    if state
        .is_indexing_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        let msg = "An indexing scan is already in progress. Please wait for it to finish or cancel it first.".to_string();
        log::warn!("{}", msg);
        return Err(msg);
    }
    let active_guard = IndexingActiveGuard(state.is_indexing_active.clone());

    state.indexing_cancel_token.store(false, Ordering::SeqCst);
    if let Ok(mut failed) = state.failed_hashes.write() {
        failed.clear();
    }
    let cancel = state.indexing_cancel_token.clone();
    let db_path = state.db_path.clone();
    let watcher_dir = validated_dir.clone();

    // Spawn background task to avoid blocking the Tauri main IPC thread
    let result = tokio::task::spawn_blocking(move || {
        let _guard = active_guard;

        let mut conn = DatabaseManager::open(&db_path)
            .map_err(|e| {
                let err_msg = format!("Failed to open SQLite database: {}", e);
                log::error!("{}", err_msg);
                err_msg
            })?;

        // Match existing library case-insensitively on Windows to avoid duplicate library entries
        #[cfg(target_os = "windows")]
        let existing_lib: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, path FROM libraries WHERE LOWER(path) = LOWER(?1) LIMIT 1;",
                rusqlite::params![canonical_path_str],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        #[cfg(not(target_os = "windows"))]
        let existing_lib: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, path FROM libraries WHERE path = ?1 LIMIT 1;",
                rusqlite::params![canonical_path_str],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        let library_id: i64 = if let Some((id, existing_path)) = existing_lib {
            if existing_path != canonical_path_str {
                let _ = conn.execute(
                    "UPDATE libraries SET path = ?1, is_active = 1 WHERE id = ?2;",
                    rusqlite::params![canonical_path_str, id],
                );
            } else {
                let _ = conn.execute(
                    "UPDATE libraries SET is_active = 1 WHERE id = ?1;",
                    rusqlite::params![id],
                );
            }
            id
        } else {
            conn.execute(
                "INSERT INTO libraries (path, created_at) VALUES (?1, ?2);",
                rusqlite::params![canonical_path_str, chrono::Utc::now().timestamp_millis()],
            )
            .map_err(|e| {
                let err_msg = format!("Failed to insert library record: {}", e);
                log::error!("{}", err_msg);
                err_msg
            })?;
            conn.last_insert_rowid()
        };

        let pipeline = IndexingPipeline::default();

        let app_handle = app.clone();
        let target_dir = canonical_path_str.clone();
        let run_res = pipeline.run(
            library_id,
            &target_dir,
            &mut conn,
            cancel,
            move |progress: IndexingProgressEvent| {
                let _ = app_handle.emit("indexing-progress", progress);
            },
        );

        // Refresh library statistics across all libraries (handles overlapping/reconciled folders)
        let _ = conn.execute(
            "UPDATE libraries SET last_scanned_at = ?1 WHERE id = ?2;",
            rusqlite::params![chrono::Utc::now().timestamp_millis(), library_id],
        );
        let _ = conn.execute(
            "UPDATE libraries SET total_files = (SELECT count(*) FROM media_files WHERE library_id = libraries.id);",
            [],
        );

        let count = run_res.map_err(|e| {
            log::error!("Pipeline run failed for '{}': {}", target_dir, e);
            e
        })?;

        log::info!(
            "Successfully finished indexing '{}'. Total indexed in run: {}",
            canonical_path_str,
            count
        );
        Ok(count)
    })
    .await
    .map_err(|e| {
        let join_err = format!("Task join error: {}", e);
        log::error!("{}", join_err);
        join_err
    })?;

    // Register folder with live filesystem watcher after initial scan finishes
    if result.is_ok() {
        if let Ok(tx) = state.watcher_tx.lock() {
            let _ = tx.send(crate::indexer::WatcherCommand::Watch(watcher_dir));
        }
    }

    result
}

#[tauri::command]
pub fn cancel_indexing(state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Cancelling active indexing scan at user request.");
    state.indexing_cancel_token.store(true, Ordering::SeqCst);
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
    let path_opt: Option<String> = conn
        .query_row(
            "SELECT path FROM libraries WHERE id = ?1;",
            rusqlite::params![library_id],
            |row| row.get(0),
        )
        .ok();
    conn.execute("DELETE FROM libraries WHERE id = ?1;", rusqlite::params![library_id])
        .map_err(|e| format!("Failed to remove library: {}", e))?;
    log::info!("Unlinked library id={} path={:?}", library_id, path_opt);
    if let Some(p) = path_opt {
        if let Ok(tx) = state.watcher_tx.lock() {
            let _ = tx.send(crate::indexer::WatcherCommand::Unwatch(PathBuf::from(p)));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn prune_missing_files(state: State<'_, AppState>) -> Result<u64, String> {
    let db_path = state.db_path.clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = DatabaseManager::open(&db_path)
            .map_err(|e| format!("Failed to open DB: {}", e))?;

        let mut missing_ids = Vec::new();
        {
            let mut stmt = conn
                .prepare("SELECT id, file_path FROM media_files ORDER BY id DESC;")
                .map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;

            let mut seen_normalized = std::collections::HashSet::new();

            for r in rows.flatten() {
                let path = std::path::Path::new(&r.1);
                let is_invalid = match std::fs::metadata(path) {
                    Ok(meta) => !meta.is_file() || meta.len() == 0,
                    Err(_) => true,
                };
                if is_invalid || crate::indexer::walker::DirectoryWalker::should_ignore_path(path) {
                    missing_ids.push(r.0);
                    continue;
                }

                #[cfg(target_os = "windows")]
                let norm_key = crate::indexer::walker::DirectoryWalker::normalize_existing_path(path)
                    .to_string_lossy()
                    .to_lowercase();
                #[cfg(not(target_os = "windows"))]
                let norm_key = crate::indexer::walker::DirectoryWalker::normalize_existing_path(path)
                    .to_string_lossy()
                    .to_string();

                if !seen_normalized.insert(norm_key) {
                    missing_ids.push(r.0);
                }
            }
        }

        let total_pruned = missing_ids.len() as u64;
        if total_pruned > 0 {
            MediaRepository::delete_stale_ids(&mut conn, &missing_ids)
                .map_err(|e| e.to_string())?;
        }

        let _ = conn.execute(
            "UPDATE libraries SET total_files = (SELECT count(*) FROM media_files WHERE library_id = libraries.id);",
            [],
        );

        log::info!("Pruned {} missing, empty, ignored, or duplicate-path files from database.", total_pruned);
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
