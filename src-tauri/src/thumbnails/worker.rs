use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use rayon::prelude::*;
use rusqlite::params;
use tauri::{AppHandle, Emitter};

use super::cache::ThumbnailCache;
use super::resizer::ThumbnailResizer;
use crate::db::DatabaseManager;

pub struct ThumbnailWorker;

#[derive(Debug)]
struct PendingThumbnailItem {
    id: i64,
    file_path: String,
    file_hash: String,
    media_type: String,
    duration: Option<f64>,
}

impl ThumbnailWorker {
    /// Starts the background thumbnail generation daemon.
    /// Runs asynchronously and drains the 'pending' queue in parallel across Rayon worker threads
    /// without blocking the UI or main application thread.
    pub fn start_daemon(
        app_handle: AppHandle,
        db_path: PathBuf,
        cache_dir: PathBuf,
        cancel_token: Arc<AtomicBool>,
    ) {
        std::thread::Builder::new()
            .name("thumbnail-generator".into())
            .spawn(move || {
                let cache = ThumbnailCache::new(&cache_dir);

                while !cancel_token.load(Ordering::Relaxed) {
                    let (processed_count, ready_count) =
                        Self::process_next_batch(&db_path, &cache, &cancel_token);

                    if ready_count > 0 {
                        let _ = app_handle.emit("thumbnails-ready", ready_count);
                    }

                    if processed_count == 0 {
                        // Sleep if queue is empty
                        std::thread::sleep(Duration::from_millis(500));
                    } else {
                        // Yield to keep CPU cool and give UI read queries priority on SQLite
                        std::thread::sleep(Duration::from_millis(25));
                    }
                }
            })
            .expect("Failed to spawn thumbnail worker thread");
    }

    fn process_next_batch(
        db_path: &Path,
        cache: &ThumbnailCache,
        cancel_token: &Arc<AtomicBool>,
    ) -> (usize, usize) {
        let mut conn = match DatabaseManager::open(db_path) {
            Ok(c) => c,
            Err(_) => return (0, 0),
        };

        // Fetch up to 80 pending items
        let mut items = Vec::new();
        {
            let mut stmt = match conn.prepare(
                "SELECT id, file_path, file_hash, media_type, duration 
                 FROM media_files 
                 WHERE thumbnail_status = 'pending' 
                 LIMIT 80;"
            ) {
                Ok(s) => s,
                Err(_) => return (0, 0),
            };

            let rows = stmt.query_map([], |row| {
                Ok(PendingThumbnailItem {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    file_hash: row.get(2)?,
                    media_type: row.get(3)?,
                    duration: row.get(4)?,
                })
            });

            if let Ok(iter) = rows {
                for item in iter.flatten() {
                    items.push(item);
                }
            }
        }

        if items.is_empty() {
            return (0, 0);
        }

        let cancel = cancel_token.clone();

        // High-performance parallel thumbnail generation across Rayon CPU pool
        let results: Vec<(i64, Option<String>)> = items
            .into_par_iter()
            .map(|item| {
                if cancel.load(Ordering::Relaxed) {
                    return (item.id, None);
                }

                let dst_path = cache.resolve_path(&item.file_hash);
                let rel_path = cache.get_relative_path(&item.file_hash);

                // If thumbnail already exists on disk (e.g. from previous run or deduplication), mark ready
                if dst_path.exists() {
                    return (item.id, Some(rel_path));
                }

                if item.media_type == "photo" || item.media_type == "raw" {
                    match ThumbnailResizer::generate_photo_thumbnail(&item.file_path, &dst_path) {
                        Ok(_) => (item.id, Some(rel_path)),
                        Err(_) => (item.id, None),
                    }
                } else if item.media_type == "video" {
                    match super::video_extractor::VideoKeyframeExtractor::extract_keyframe(&item.file_path, &dst_path, item.duration) {
                        Ok(_) => (item.id, Some(rel_path)),
                        Err(_) => (item.id, None),
                    }
                } else {
                    (item.id, Some(rel_path))
                }
            })
            .collect();

        let total_count = results.len();
        let ready_count = results.iter().filter(|(_, res)| res.is_some()).count();

        // Batch update database in a single fast transaction
        if let Ok(tx) = conn.transaction() {
            {
                let ready_res = tx.prepare_cached(
                    "UPDATE media_files SET thumbnail_path = ?1, thumbnail_status = 'ready', updated_at = ?2 WHERE id = ?3;",
                );
                let failed_res = tx.prepare_cached(
                    "UPDATE media_files SET thumbnail_status = 'failed', updated_at = ?1 WHERE id = ?2;",
                );

                if let (Ok(mut ready_stmt), Ok(mut failed_stmt)) = (ready_res, failed_res) {
                    let now = chrono::Utc::now().timestamp_millis();
                    for (id, res) in results {
                        match res {
                            Some(path) => {
                                let _ = ready_stmt.execute(params![path, now, id]);
                            }
                            None => {
                                let _ = failed_stmt.execute(params![now, id]);
                            }
                        }
                    }
                }
            }
            let _ = tx.commit();
        }

        (total_count, ready_count)
    }
}

