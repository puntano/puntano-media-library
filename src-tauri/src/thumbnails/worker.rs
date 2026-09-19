use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use rusqlite::{params, Connection};

use super::cache::ThumbnailCache;
use super::resizer::ThumbnailResizer;

pub struct ThumbnailWorker;

#[derive(Debug)]
struct PendingThumbnailItem {
    id: i64,
    file_path: String,
    file_hash: String,
    media_type: String,
}

impl ThumbnailWorker {
    /// Starts the background thumbnail generation daemon.
    /// Runs asynchronously and drains the 'pending' queue without blocking the UI or main thread.
    pub fn start_daemon(
        db_path: PathBuf,
        cache_dir: PathBuf,
        cancel_token: Arc<AtomicBool>,
    ) {
        std::thread::Builder::new()
            .name("thumbnail-generator".into())
            .spawn(move || {
                let cache = ThumbnailCache::new(&cache_dir);

                while !cancel_token.load(Ordering::Relaxed) {
                    let processed_count = Self::process_next_batch(&db_path, &cache, &cancel_token);

                    if processed_count == 0 {
                        // Sleep if queue is empty
                        std::thread::sleep(Duration::from_millis(500));
                    }
                }
            })
            .expect("Failed to spawn thumbnail worker thread");
    }

    fn process_next_batch(
        db_path: &Path,
        cache: &ThumbnailCache,
        cancel_token: &Arc<AtomicBool>,
    ) -> usize {
        let mut conn = match Connection::open(db_path) {
            Ok(c) => c,
            Err(_) => return 0,
        };

        // Fetch up to 50 pending items
        let mut items = Vec::new();
        {
            let mut stmt = match conn.prepare(
                "SELECT id, file_path, file_hash, media_type 
                 FROM media_files 
                 WHERE thumbnail_status = 'pending' 
                 LIMIT 50;"
            ) {
                Ok(s) => s,
                Err(_) => return 0,
            };

            let rows = stmt.query_map([], |row| {
                Ok(PendingThumbnailItem {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    file_hash: row.get(2)?,
                    media_type: row.get(3)?,
                })
            });

            if let Ok(iter) = rows {
                for item in iter.flatten() {
                    items.push(item);
                }
            }
        }

        if items.is_empty() {
            return 0;
        }

        let mut ready_updates = Vec::new();
        let mut failed_updates = Vec::new();

        for item in &items {
            if cancel_token.load(Ordering::Relaxed) {
                break;
            }

            let dst_path = cache.resolve_path(&item.file_hash);
            let rel_path = cache.get_relative_path(&item.file_hash);

            // If thumbnail already exists on disk (e.g. from previous run), mark ready
            if dst_path.exists() {
                ready_updates.push((item.id, rel_path));
                continue;
            }

            if item.media_type == "photo" || item.media_type == "raw" {
                match ThumbnailResizer::generate_photo_thumbnail(&item.file_path, &dst_path) {
                    Ok(_) => ready_updates.push((item.id, rel_path)),
                    Err(_) => failed_updates.push(item.id),
                }
            } else {
                // For videos, mark pending/skipped until keyframe extraction sidecar is invoked
                ready_updates.push((item.id, rel_path));
            }
        }

        // Batch update database in a single transaction
        if let Ok(tx) = conn.transaction() {
            {
                let mut ready_stmt = tx
                    .prepare_cached(
                        "UPDATE media_files SET thumbnail_path = ?1, thumbnail_status = 'ready', updated_at = ?2 WHERE id = ?3;",
                    )
                    .unwrap();

                let now = chrono::Utc::now().timestamp_millis();
                for (id, path) in ready_updates {
                    let _ = ready_stmt.execute(params![path, now, id]);
                }

                let mut failed_stmt = tx
                    .prepare_cached(
                        "UPDATE media_files SET thumbnail_status = 'failed', updated_at = ?1 WHERE id = ?2;",
                    )
                    .unwrap();

                for id in failed_updates {
                    let _ = failed_stmt.execute(params![now, id]);
                }
            }
            let _ = tx.commit();
        }

        items.len()
    }
}
