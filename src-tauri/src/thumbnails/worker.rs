use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use rayon::prelude::*;
use rusqlite::params;
use tauri::{AppHandle, Emitter};

use super::cache::ThumbnailCache;
use super::resizer::ThumbnailResizer;
use crate::db::DatabaseManager;

pub struct ThumbnailWorker;

#[derive(Debug, Clone)]
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
        shutdown_token: Arc<AtomicBool>,
        failed_hashes: Arc<RwLock<HashSet<String>>>,
    ) {
        std::thread::Builder::new()
            .name("thumbnail-generator".into())
            .spawn(move || {
                log::info!("[ThumbnailWorker] Background thumbnail daemon started.");
                let cache = ThumbnailCache::new(&cache_dir);

                // Heal previously failed or missing-on-disk cached thumbnails in background on startup
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    Self::verify_and_heal_cache(&db_path, &cache, &shutdown_token);
                }));

                let mut cumulative_ready: usize = 0;
                let mut cumulative_failed: usize = 0;
                let mut was_active = false;
                let mut last_progress_log = Instant::now();

                while !shutdown_token.load(Ordering::Relaxed) {
                    let batch_outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        Self::process_next_batch(&db_path, &cache, &shutdown_token, &failed_hashes)
                    }));

                    let (processed_count, ready_count, failed_count) = match batch_outcome {
                        Ok(counts) => counts,
                        Err(_) => {
                            log::error!("[ThumbnailWorker] Recovered from unexpected panic during batch processing.");
                            std::thread::sleep(Duration::from_millis(500));
                            continue;
                        }
                    };

                    if processed_count > 0 {
                        was_active = true;
                        cumulative_ready += ready_count;
                        cumulative_failed += failed_count;

                        // Notify UI whenever pending items finish (ready or failed) so placeholders update immediately
                        let _ = app_handle.emit("thumbnails-ready", processed_count);

                        if last_progress_log.elapsed() >= Duration::from_secs(15) {
                            log::info!(
                                "[ThumbnailWorker] Progress: {} ready, {} failed in current queue.",
                                cumulative_ready,
                                cumulative_failed
                            );
                            last_progress_log = Instant::now();
                        }

                        // Yield briefly to keep CPU cool and give UI read queries priority on SQLite
                        std::thread::sleep(Duration::from_millis(20));
                    } else {
                        if was_active {
                            log::info!(
                                "[ThumbnailWorker] Pending queue drained: {} thumbnails ready, {} failed.",
                                cumulative_ready,
                                cumulative_failed
                            );
                            cumulative_ready = 0;
                            cumulative_failed = 0;
                            was_active = false;
                        }
                        // Sleep if queue is empty
                        std::thread::sleep(Duration::from_millis(500));
                    }
                }

                log::info!("[ThumbnailWorker] Background thumbnail daemon shutting down.");
            })
            .expect("Failed to spawn thumbnail worker thread");
    }

    fn verify_and_heal_cache(
        db_path: &Path,
        cache: &ThumbnailCache,
        shutdown_token: &Arc<AtomicBool>,
    ) {
        let mut conn = match DatabaseManager::open(db_path) {
            Ok(c) => c,
            Err(_) => return,
        };

        let reset_failed = conn
            .execute(
                "UPDATE media_files SET thumbnail_status = 'pending' WHERE thumbnail_status = 'failed';",
                [],
            )
            .unwrap_or(0);

        let mut missing_hashes = Vec::new();
        if let Ok(mut stmt) = conn.prepare("SELECT DISTINCT file_hash FROM media_files WHERE thumbnail_status = 'ready';") {
            if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                for hash in rows.flatten() {
                    if shutdown_token.load(Ordering::Relaxed) {
                        return;
                    }
                    let dst = cache.resolve_path(&hash);
                    if !ThumbnailCache::is_valid_cached_file(&dst) {
                        missing_hashes.push(hash);
                    }
                }
            }
        }

        let mut reset_missing = 0usize;
        if !missing_hashes.is_empty() {
            if let Ok(tx) = conn.transaction() {
                if let Ok(mut upd) = tx.prepare_cached(
                    "UPDATE media_files SET thumbnail_status = 'pending' WHERE file_hash = ?1 AND thumbnail_status = 'ready';",
                ) {
                    for hash in &missing_hashes {
                        reset_missing += upd.execute(params![hash]).unwrap_or(0);
                    }
                }
                let _ = tx.commit();
            }
        }

        if reset_failed > 0 || reset_missing > 0 {
            log::info!(
                "[ThumbnailWorker] Startup cache check queued {} previously failed and {} missing-cache thumbnails for regeneration.",
                reset_failed,
                reset_missing
            );
        }
    }

    fn process_next_batch(
        db_path: &Path,
        cache: &ThumbnailCache,
        shutdown_token: &Arc<AtomicBool>,
        failed_hashes: &Arc<RwLock<HashSet<String>>>,
    ) -> (usize, usize, usize) {
        let mut conn = match DatabaseManager::open(db_path) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("[ThumbnailWorker] Failed to open SQLite connection: {}", e);
                return (0, 0, 0);
            }
        };

        // Fetch up to 80 pending items ordered newest-first to match Gallery & Timeline viewport priority
        let mut items = Vec::with_capacity(80);
        {
            let mut stmt = match conn.prepare(
                "SELECT id, file_path, file_hash, media_type, duration 
                 FROM media_files 
                 WHERE thumbnail_status = 'pending' 
                 ORDER BY COALESCE(captured_at, file_modified_at) DESC, id DESC
                 LIMIT 80;",
            ) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("[ThumbnailWorker] Failed to prepare pending query: {}", e);
                    return (0, 0, 0);
                }
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
            return (0, 0, 0);
        }

        // Deduplicate by file_hash within the batch so identical files are only decoded once
        let mut unique_by_hash: HashMap<String, PendingThumbnailItem> = HashMap::with_capacity(items.len());
        for item in &items {
            unique_by_hash
                .entry(item.file_hash.clone())
                .or_insert_with(|| item.clone());
        }
        let unique_tasks: Vec<PendingThumbnailItem> = unique_by_hash.into_values().collect();

        let shutdown = shutdown_token.clone();

        // High-performance parallel thumbnail generation across Rayon CPU pool with per-item panic isolation
        let hash_results: HashMap<String, Result<String, String>> = unique_tasks
            .into_par_iter()
            .filter_map(|item| {
                if shutdown.load(Ordering::Relaxed) {
                    return None;
                }

                let file_hash = item.file_hash.clone();
                let file_path = item.file_path.clone();

                let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<String, String> {
                    let dst_path = cache.resolve_path(&item.file_hash);

                    // If valid non-empty thumbnail already exists on disk, mark ready immediately
                    if ThumbnailCache::is_valid_cached_file(&dst_path) {
                        return Ok(cache.get_relative_path(&item.file_hash));
                    }

                    if item.media_type == "photo" || item.media_type == "raw" {
                        ThumbnailResizer::generate_photo_thumbnail(&item.file_path, &dst_path)?;
                        Ok(cache.get_relative_path(&item.file_hash))
                    } else if item.media_type == "video" {
                        super::video_extractor::VideoKeyframeExtractor::extract_keyframe(
                            &item.file_path,
                            &dst_path,
                            item.duration,
                        )?;
                        Ok(cache.get_relative_path(&item.file_hash))
                    } else {
                        Ok(cache.get_relative_path(&item.file_hash))
                    }
                }));

                let res = match outcome {
                    Ok(r) => r,
                    Err(_) => Err(format!("Decoder panicked while processing '{}'", file_path)),
                };

                Some((file_hash, res))
            })
            .collect();

        if shutdown_token.load(Ordering::Relaxed) && hash_results.is_empty() {
            return (0, 0, 0);
        }

        let mut ready_count = 0usize;
        let mut failed_count = 0usize;
        let mut logged_failures = 0usize;

        if let Ok(mut guard) = failed_hashes.write() {
            for (hash, res) in &hash_results {
                match res {
                    Ok(_) => {
                        guard.remove(hash);
                    }
                    Err(_) => {
                        guard.insert(hash.clone());
                    }
                }
            }
        }

        // Batch update database in a single fast transaction
        let mut updated_count = 0usize;
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
                    for item in &items {
                        if let Some(res) = hash_results.get(&item.file_hash) {
                            match res {
                                Ok(rel_path) => {
                                    let _ = ready_stmt.execute(params![rel_path, now, item.id]);
                                    ready_count += 1;
                                    updated_count += 1;
                                }
                                Err(err_msg) => {
                                    let _ = failed_stmt.execute(params![now, item.id]);
                                    failed_count += 1;
                                    updated_count += 1;
                                    if logged_failures < 5 {
                                        log::warn!(
                                            "[ThumbnailWorker] Thumbnail failed for '{}': {}",
                                            item.file_path,
                                            err_msg
                                        );
                                        logged_failures += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            let _ = tx.commit();
        }

        if failed_count > logged_failures {
            log::warn!(
                "[ThumbnailWorker] {} additional thumbnails failed in this batch.",
                failed_count - logged_failures
            );
        }

        (updated_count, ready_count, failed_count)
    }
}

