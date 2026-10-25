use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver, RecvTimeoutError, Sender};
use rayon::prelude::*;
use rusqlite::{params, Connection};
use xxhash_rust::xxh64::Xxh64;

use crate::db::MediaRepository;
use crate::indexer::walker::DirectoryWalker;
use crate::metadata::{PhotoMetadataParser, VideoMetadataParser};
use crate::models::{IndexingProgressEvent, MediaItem};

pub struct IndexingPipeline {
    batch_size: usize,
}

impl Default for IndexingPipeline {
    fn default() -> Self {
        Self { batch_size: 150 }
    }
}

impl IndexingPipeline {
    pub fn new(batch_size: usize) -> Self {
        Self { batch_size }
    }

    /// Computes a fast xxHash64 over the file content:
    /// - Full file if <= 1MB
    /// - First 512KB + middle 64KB + last 64KB + file size for files > 1MB
    pub fn compute_fast_hash<P: AsRef<Path>>(path: P, file_size: i64) -> String {
        let mut hasher = Xxh64::new(0);
        let mut file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return format!("{:x}", file_size),
        };

        if file_size <= 1024 * 1024 {
            // Read entire file if under 1MB
            let mut buffer = Vec::with_capacity(file_size as usize);
            if file.read_to_end(&mut buffer).is_ok() {
                hasher.update(&buffer);
            }
        } else {
            let size_u64 = file_size as u64;
            // 1. Read first 512KB
            let mut head_buf = vec![0u8; 524288];
            if let Ok(n) = file.read(&mut head_buf) {
                hasher.update(&head_buf[..n]);
            }

            // 2. Read middle 64KB
            let mut chunk_buf = [0u8; 65536];
            let mid_offset = (size_u64 / 2).saturating_sub(32768);
            if file.seek(SeekFrom::Start(mid_offset)).is_ok() {
                if let Ok(n) = file.read(&mut chunk_buf) {
                    hasher.update(&chunk_buf[..n]);
                }
            }

            // 3. Read last 64KB
            let tail_offset = size_u64.saturating_sub(65536);
            if file.seek(SeekFrom::Start(tail_offset)).is_ok() {
                if let Ok(n) = file.read(&mut chunk_buf) {
                    hasher.update(&chunk_buf[..n]);
                }
            }

            hasher.update(&file_size.to_le_bytes());
        }

        format!("{:016x}", hasher.digest())
    }

    /// Executes the multi-stage concurrent indexing pipeline.
    /// Non-blocking: CPU-intensive metadata parsing runs on Rayon thread pool,
    /// batch writes run on a dedicated SQLite connection thread.
    pub fn run<F>(
        &self,
        library_id: i64,
        root_dir: &str,
        conn: &mut Connection,
        cancel_token: Arc<AtomicBool>,
        progress_callback: F,
    ) -> Result<u64, String>
    where
        F: Fn(IndexingProgressEvent) + Send + Sync + 'static,
    {
        let start_time = Instant::now();

        log::info!(
            "Beginning indexing pipeline for library {}, root_dir: '{}'",
            library_id,
            root_dir
        );

        // 1. Stage 1: Fast Filesystem Discovery
        progress_callback(IndexingProgressEvent {
            stage: "discovering".into(),
            scanned_files: 0,
            indexed_files: 0,
            current_directory: root_dir.to_string(),
            is_complete: false,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
        });

        let discovered = DirectoryWalker::walk_with_progress(
            root_dir,
            Some(cancel_token.clone()),
            |current_dir, count| {
                progress_callback(IndexingProgressEvent {
                    stage: "discovering".into(),
                    scanned_files: count as u64,
                    indexed_files: 0,
                    current_directory: current_dir.to_string(),
                    is_complete: false,
                    elapsed_ms: start_time.elapsed().as_millis() as u64,
                });
            },
        )?;

        if cancel_token.load(Ordering::Relaxed) {
            log::info!("Indexing cancelled during discovery phase.");
            return Ok(0);
        }

        let total_discovered = discovered.len() as u64;

        let path_key = |p: &str| -> String {
            #[cfg(windows)]
            {
                p.to_lowercase()
            }
            #[cfg(not(windows))]
            {
                p.to_string()
            }
        };

        // Load existing DB records for this library or physically under root_dir to reconcile
        // deleted/moved/hidden files, case-variant duplicates on Windows, and overlapping libraries.
        let existing_records = MediaRepository::load_records_for_root_scan(conn, library_id, root_dir)
            .unwrap_or_default();

        let mut discovered_by_key: HashMap<String, String> = HashMap::with_capacity(discovered.len());
        let mut discovered_dirs_by_key: HashMap<String, String> = HashMap::with_capacity(discovered.len());
        for d in &discovered {
            let canonical = d.path.to_string_lossy().to_string();
            let k = path_key(&canonical);
            discovered_by_key.insert(k.clone(), canonical);
            discovered_dirs_by_key.insert(k, d.directory.clone());
        }

        // Deduplicate any pre-existing case-variant rows and collect stale/removed rows for pruning
        let mut stale_ids: Vec<i64> = Vec::new();
        // Map normalized path key -> (id, lib_id, stored_path, mtime, size, thumb_status)
        let mut kept_existing: HashMap<String, (i64, i64, String, i64, i64, String)> = HashMap::new();

        for rec in existing_records {
            let k = path_key(&rec.2);
            let Some(canonical_target) = discovered_by_key.get(&k) else {
                // File no longer exists on disk under root_dir (deleted, moved, or now filtered as hidden/system/0B)
                stale_ids.push(rec.0);
                continue;
            };

            if let Some(prev) = kept_existing.get(&k) {
                // Two DB rows existed for the same physical file (e.g. legacy Windows case mismatch):
                // keep the row matching exact canonical casing, delete the duplicate row.
                if &rec.2 == canonical_target && &prev.2 != canonical_target {
                    stale_ids.push(prev.0);
                    kept_existing.insert(k, rec);
                } else {
                    stale_ids.push(rec.0);
                }
            } else {
                kept_existing.insert(k, rec);
            }
        }

        if !stale_ids.is_empty() && !cancel_token.load(Ordering::Relaxed) {
            if let Ok(pruned) = MediaRepository::delete_stale_ids(conn, &stale_ids) {
                log::info!(
                    "Reconciled '{}': pruned {} stale, missing, or duplicate-case records from database.",
                    root_dir,
                    pruned
                );
            }
        }

        if total_discovered == 0 {
            log::info!(
                "Discovery completed for '{}': 0 supported media files found.",
                root_dir
            );
            progress_callback(IndexingProgressEvent {
                stage: "completed".into(),
                scanned_files: 0,
                indexed_files: 0,
                current_directory: root_dir.to_string(),
                is_complete: true,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
            });
            return Ok(0);
        }

        // Normalize path casing / library_id / failed thumbnail_status on kept existing records in a single fast tx
        let mut unchanged_fixes: Vec<(i64, String, String, i64, bool)> = Vec::new();
        let mut files_to_process = Vec::new();
        let mut seen_discovered_keys: HashSet<String> = HashSet::with_capacity(discovered.len());

        for file in discovered {
            let path_str = file.path.to_string_lossy().to_string();
            let k = path_key(&path_str);
            if !seen_discovered_keys.insert(k.clone()) {
                continue;
            }

            match kept_existing.get(&k) {
                Some((id, old_lib_id, stored_path, mtime, size, thumb_status)) => {
                    let needs_reextract = *mtime != file.file_modified_at || *size != file.file_size;
                    let needs_path_or_lib_sync = stored_path != &path_str || *old_lib_id != library_id;
                    let needs_thumb_retry = thumb_status == "failed";

                    if needs_reextract {
                        if stored_path != &path_str {
                            // Align stored path first so ON CONFLICT(file_path) updates this exact row id
                            unchanged_fixes.push((*id, path_str, file.directory.clone(), library_id, false));
                        }
                        files_to_process.push(file);
                    } else if needs_path_or_lib_sync || needs_thumb_retry {
                        let target_dir = discovered_dirs_by_key
                            .get(&k)
                            .cloned()
                            .unwrap_or_else(|| file.directory.clone());
                        unchanged_fixes.push((*id, path_str, target_dir, library_id, needs_thumb_retry));
                    }
                }
                None => {
                    files_to_process.push(file);
                }
            }
        }

        if !unchanged_fixes.is_empty() {
            if let Ok(tx) = conn.transaction() {
                let now = chrono::Utc::now().timestamp_millis();
                for (id, new_path, new_dir, new_lib_id, retry_thumb) in &unchanged_fixes {
                    if *retry_thumb {
                        let _ = tx.execute(
                            "UPDATE media_files SET file_path = ?1, directory = ?2, library_id = ?3, thumbnail_status = 'pending', updated_at = ?4 WHERE id = ?5;",
                            params![new_path, new_dir, new_lib_id, now, id],
                        );
                    } else {
                        let _ = tx.execute(
                            "UPDATE media_files SET file_path = ?1, directory = ?2, library_id = ?3, updated_at = ?4 WHERE id = ?5;",
                            params![new_path, new_dir, new_lib_id, now, id],
                        );
                    }
                }
                let _ = tx.commit();
            }
        }

        let total_unique = seen_discovered_keys.len() as u64;
        let unchanged_count = total_unique.saturating_sub(files_to_process.len() as u64);

        if files_to_process.is_empty() {
            log::info!(
                "Differential scan complete for '{}': all {} files are unchanged ({}ms).",
                root_dir,
                total_unique,
                start_time.elapsed().as_millis()
            );
            progress_callback(IndexingProgressEvent {
                stage: "completed".into(),
                scanned_files: total_unique,
                indexed_files: total_unique,
                current_directory: root_dir.to_string(),
                is_complete: true,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
            });
            return Ok(total_unique);
        }

        let discovery_ms = start_time.elapsed().as_millis();
        let to_extract_count = files_to_process.len();

        log::info!(
            "Discovery complete for '{}': {} files found ({} unchanged, {} new/modified) in {}ms. Starting metadata extraction & SQLite ingestion.",
            root_dir,
            total_unique,
            unchanged_count,
            to_extract_count,
            discovery_ms
        );

        // Emit immediate transition into "indexing" with fixed denominator `total_unique`
        progress_callback(IndexingProgressEvent {
            stage: "indexing".into(),
            scanned_files: total_unique,
            indexed_files: unchanged_count,
            current_directory: root_dir.to_string(),
            is_complete: false,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
        });

        // Bounded channel to prevent uncontrolled memory spikes during large library scans
        let (tx, rx): (Sender<MediaItem>, Receiver<MediaItem>) = bounded(500);
        let cancel = cancel_token.clone();
        let unreadable_files = Arc::new(AtomicUsize::new(0));
        let unreadable_producer = unreadable_files.clone();
        let slow_files_logged = Arc::new(AtomicUsize::new(0));
        let slow_files_producer = slow_files_logged.clone();

        // 2. Stage 2: Parallel Metadata Extraction (Rayon Worker Pool)
        let producer_handle = std::thread::spawn(move || {
            files_to_process.into_par_iter().for_each(|file| {
                if cancel.load(Ordering::Relaxed) {
                    return;
                }

                let item_start = Instant::now();
                if File::open(&file.path).is_err() {
                    let count = unreadable_producer.fetch_add(1, Ordering::Relaxed);
                    if count < 5 {
                        log::warn!(
                            "Could not open file for hashing/extraction '{}'",
                            file.path.display()
                        );
                    }
                }

                let path_str = file.path.to_string_lossy().to_string();
                let hash = Self::compute_fast_hash(&file.path, file.file_size);
                let now = chrono::Utc::now().timestamp_millis();

                let mut item = MediaItem {
                    id: None,
                    library_id,
                    file_path: path_str,
                    directory: file.directory,
                    file_name: file.file_name,
                    file_size: file.file_size,
                    file_modified_at: file.file_modified_at,
                    file_hash: hash,
                    mime_type: file.mime_type,
                    media_type: file.media_type.clone(),
                    width: None,
                    height: None,
                    duration: None,
                    orientation: 1,
                    captured_at: None,
                    captured_at_local: None,
                    timezone_offset: None,
                    latitude: None,
                    longitude: None,
                    altitude: None,
                    geohash: None,
                    camera_make: None,
                    camera_model: None,
                    lens_model: None,
                    focal_length: None,
                    aperture: None,
                    iso: None,
                    exposure_time: None,
                    thumbnail_path: None,
                    thumbnail_status: "pending".into(),
                    is_favorite: false,
                    rating: 0,
                    indexed_at: now,
                    updated_at: now,
                };

                let file_path = file.path.clone();
                let file_path_for_log = file.path.clone();
                let media_type = file.media_type.clone();

                // Safe wrapper to prevent any potential third-party parser panic from crashing threads
                let parse_outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    if media_type == "photo" || media_type == "raw" {
                        let p_meta = PhotoMetadataParser::parse(&file_path);
                        item.width = p_meta.width;
                        item.height = p_meta.height;
                        item.orientation = p_meta.orientation;
                        item.captured_at = p_meta.captured_at;
                        item.captured_at_local = p_meta.captured_at_local;
                        item.timezone_offset = p_meta.timezone_offset;
                        item.latitude = p_meta.latitude;
                        item.longitude = p_meta.longitude;
                        item.altitude = p_meta.altitude;
                        item.camera_make = p_meta.camera_make;
                        item.camera_model = p_meta.camera_model;
                        item.lens_model = p_meta.lens_model;
                        item.focal_length = p_meta.focal_length;
                        item.aperture = p_meta.aperture;
                        item.iso = p_meta.iso;
                        item.exposure_time = p_meta.exposure_time;
                    } else if media_type == "video" {
                        let v_meta = VideoMetadataParser::parse(&file_path);
                        item.width = v_meta.width;
                        item.height = v_meta.height;
                        item.duration = v_meta.duration;
                        item.captured_at = v_meta.captured_at;
                        item.captured_at_local = v_meta.captured_at_local;
                        item.latitude = v_meta.latitude;
                        item.longitude = v_meta.longitude;
                        item.altitude = v_meta.altitude;
                    }
                }));

                if parse_outcome.is_err() {
                    log::error!(
                        "Metadata parser panicked on file '{}' (isolated safely, indexing continues)",
                        file_path_for_log.display()
                    );
                }

                // Compute coarse geohash if coordinates present
                if let (Some(lat), Some(lon)) = (item.latitude, item.longitude) {
                    item.geohash = Some(Self::encode_geohash(lat, lon, 7));
                }

                let item_elapsed_ms = item_start.elapsed().as_millis();
                if item_elapsed_ms >= 2500 {
                    let prev = slow_files_producer.fetch_add(1, Ordering::Relaxed);
                    if prev < 5 {
                        log::warn!(
                            "Slow file read/metadata extraction ({}ms) on '{}' (size={} bytes) — check slow external media or cloud placeholder hydration.",
                            item_elapsed_ms,
                            file_path_for_log.display(),
                            item.file_size
                        );
                    }
                }

                let _ = tx.send(item);
            });

            // Dropping tx signals completion to rx
        });

        // 3. Stage 3: Dedicated Transactional Batch Ingestion (Writer)
        let mut batch = Vec::with_capacity(self.batch_size);
        let mut total_indexed: u64 = unchanged_count;
        let mut current_dir_display = root_dir.to_string();
        let mut last_flush = Instant::now();
        let mut last_milestone_log = Instant::now();
        let mut sqlite_commit_ms: u128 = 0;
        let mut writer_error: Option<String> = None;

        loop {
            if cancel_token.load(Ordering::Relaxed) {
                log::info!("Indexing pipeline cancelled during metadata extraction / ingestion.");
                break;
            }

            match rx.recv_timeout(Duration::from_millis(120)) {
                Ok(item) => {
                    if !item.directory.is_empty() {
                        current_dir_display = item.directory.clone();
                    }
                    batch.push(item);

                    let should_flush =
                        batch.len() >= self.batch_size || last_flush.elapsed() >= Duration::from_millis(400);

                    if should_flush {
                        let commit_start = Instant::now();
                        if let Err(e) = MediaRepository::insert_batch(conn, &batch) {
                            cancel_token.store(true, Ordering::Relaxed);
                            writer_error = Some(format!("Batch insertion failed: {}", e));
                            break;
                        }
                        sqlite_commit_ms += commit_start.elapsed().as_millis();
                        total_indexed = (total_indexed + batch.len() as u64).min(total_unique);
                        batch.clear();
                        last_flush = Instant::now();

                        progress_callback(IndexingProgressEvent {
                            stage: "indexing".into(),
                            scanned_files: total_unique,
                            indexed_files: total_indexed,
                            current_directory: current_dir_display.clone(),
                            is_complete: false,
                            elapsed_ms: start_time.elapsed().as_millis() as u64,
                        });

                        if last_milestone_log.elapsed() >= Duration::from_secs(20) {
                            log::info!(
                                "Indexing progress for '{}': {}/{} files ({:.0}%, sqlite_commit_ms={})",
                                root_dir,
                                total_indexed,
                                total_unique,
                                (total_indexed as f64 / total_unique.max(1) as f64) * 100.0,
                                sqlite_commit_ms
                            );
                            last_milestone_log = Instant::now();
                        }
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    if !batch.is_empty() && last_flush.elapsed() >= Duration::from_millis(400) {
                        let commit_start = Instant::now();
                        if let Err(e) = MediaRepository::insert_batch(conn, &batch) {
                            cancel_token.store(true, Ordering::Relaxed);
                            writer_error = Some(format!("Batch insertion failed: {}", e));
                            break;
                        }
                        sqlite_commit_ms += commit_start.elapsed().as_millis();
                        total_indexed = (total_indexed + batch.len() as u64).min(total_unique);
                        batch.clear();
                        last_flush = Instant::now();

                        progress_callback(IndexingProgressEvent {
                            stage: "indexing".into(),
                            scanned_files: total_unique,
                            indexed_files: total_indexed,
                            current_directory: current_dir_display.clone(),
                            is_complete: false,
                            elapsed_ms: start_time.elapsed().as_millis() as u64,
                        });
                    }
                }
                Err(RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }

        // Drop rx first so any blocked tx.send() unblocks immediately if cancelled, then join producer thread
        drop(rx);
        let _ = producer_handle.join();

        if let Some(err) = writer_error {
            log::error!("Indexing writer aborted for '{}': {}", root_dir, err);
            return Err(err);
        }

        // Flush remaining items if not cancelled
        if !batch.is_empty() && !cancel_token.load(Ordering::Relaxed) {
            let commit_start = Instant::now();
            if let Err(e) = MediaRepository::insert_batch(conn, &batch) {
                log::error!("Final SQLite batch insertion failed for '{}': {}", root_dir, e);
                return Err(format!("Final batch insertion failed: {}", e));
            }
            sqlite_commit_ms += commit_start.elapsed().as_millis();
            total_indexed = (total_indexed + batch.len() as u64).min(total_unique);
        }

        if cancel_token.load(Ordering::Relaxed) {
            progress_callback(IndexingProgressEvent {
                stage: "completed".into(),
                scanned_files: total_unique,
                indexed_files: total_indexed,
                current_directory: root_dir.to_string(),
                is_complete: true,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
            });
            return Ok(total_indexed);
        }

        log::info!(
            "Indexing pipeline successfully completed for library {}: {} items indexed ({} unchanged, {} extracted) in {}ms [discovery_ms={}, sqlite_commit_ms={}, unreadable_files={}, slow_files={}].",
            library_id,
            total_indexed,
            unchanged_count,
            to_extract_count,
            start_time.elapsed().as_millis(),
            discovery_ms,
            sqlite_commit_ms,
            unreadable_files.load(Ordering::Relaxed),
            slow_files_logged.load(Ordering::Relaxed)
        );

        // Final completion event
        progress_callback(IndexingProgressEvent {
            stage: "completed".into(),
            scanned_files: total_unique,
            indexed_files: total_indexed,
            current_directory: root_dir.to_string(),
            is_complete: true,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
        });

        Ok(total_indexed)
    }

    /// Generates a standard base32 geohash string for coarse tile spatial aggregation
    pub fn encode_geohash(latitude: f64, longitude: f64, precision: usize) -> String {
        const BASE32: &[u8] = b"0123456789bcdefghjkmnpqrstuvwxyz";
        let mut lat_range = (-90.0, 90.0);
        let mut lon_range = (-180.0, 180.0);
        let mut geohash = String::with_capacity(precision);
        let mut is_lon = true;
        let mut ch = 0u8;
        let mut bit = 0u8;

        while geohash.len() < precision {
            if is_lon {
                let mid = (lon_range.0 + lon_range.1) / 2.0;
                if longitude >= mid {
                    ch |= 1 << (4 - bit);
                    lon_range.0 = mid;
                } else {
                    lon_range.1 = mid;
                }
            } else {
                let mid = (lat_range.0 + lat_range.1) / 2.0;
                if latitude >= mid {
                    ch |= 1 << (4 - bit);
                    lat_range.0 = mid;
                } else {
                    lat_range.1 = mid;
                }
            }

            is_lon = !is_lon;
            bit += 1;

            if bit == 5 {
                geohash.push(BASE32[ch as usize] as char);
                bit = 0;
                ch = 0;
            }
        }

        geohash
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_geohash_encoding() {
        // San Francisco (37.7749, -122.4194)
        let sf_hash = IndexingPipeline::encode_geohash(37.7749, -122.4194, 5);
        assert_eq!(&sf_hash[..3], "9q8");

        // London (51.5074, -0.1278)
        let london_hash = IndexingPipeline::encode_geohash(51.5074, -0.1278, 5);
        assert_eq!(&london_hash[..3], "gcp");
    }

    #[test]
    fn test_fast_hash_length() {
        let temp_file = std::env::temp_dir().join("test_hash_sample.bin");
        std::fs::write(&temp_file, b"sample binary content for xxhash verification").unwrap();
        let hash = IndexingPipeline::compute_fast_hash(&temp_file, 45);
        assert_eq!(hash.len(), 16);
        let _ = std::fs::remove_file(temp_file);
    }

    #[test]
    fn test_fast_hash_multi_region_distinguishes_large_files() {
        let size = 2 * 1024 * 1024; // 2 MB
        let content_a = vec![0xAAu8; size];
        let mut content_b = vec![0xAAu8; size];
        // Modify a byte near the end (outside the first 512KB)
        content_b[size - 100] = 0xFF;

        let path_a = std::env::temp_dir().join("test_hash_large_a.bin");
        let path_b = std::env::temp_dir().join("test_hash_large_b.bin");
        std::fs::write(&path_a, &content_a).unwrap();
        std::fs::write(&path_b, &content_b).unwrap();

        let hash_a = IndexingPipeline::compute_fast_hash(&path_a, size as i64);
        let hash_b = IndexingPipeline::compute_fast_hash(&path_b, size as i64);

        let _ = std::fs::remove_file(path_a);
        let _ = std::fs::remove_file(path_b);

        assert_ne!(hash_a, hash_b, "Multi-region hash must distinguish large files with identical 512KB headers");
    }

    #[test]
    fn test_pipeline_progress_monotonicity_and_reconciliation() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!("puntano_pipeline_test_{}", nanos));
        let media_dir = temp_root.join("library");
        let nas_dir = media_dir.join("@eaDir");
        std::fs::create_dir_all(&nas_dir).unwrap();

        for i in 0..12 {
            let file_path = media_dir.join(format!("photo_{:02}.jpg", i));
            std::fs::write(&file_path, format!("fake-jpeg-payload-{}", i)).unwrap();
        }
        // Empty 0-byte file and NAS thumbnail folder file must be ignored
        std::fs::write(media_dir.join("broken_empty.jpg"), b"").unwrap();
        std::fs::write(nas_dir.join("synology_thumb.jpg"), b"nas-thumb").unwrap();

        let db_path = temp_root.join("test.db");
        let mut conn = crate::db::DatabaseManager::open_and_migrate(&db_path).unwrap();
        let norm_root = DirectoryWalker::validate_root_directory(&media_dir)
            .unwrap()
            .to_string_lossy()
            .to_string();
        conn.execute(
            "INSERT INTO libraries (path, created_at) VALUES (?1, ?2);",
            params![norm_root, 1000i64],
        )
        .unwrap();
        let lib_id = conn.last_insert_rowid();

        let events: Arc<std::sync::Mutex<Vec<IndexingProgressEvent>>> =
            Arc::new(std::sync::Mutex::new(Vec::new()));
        let events_cb = events.clone();

        let pipeline = IndexingPipeline::new(3);
        let cancel = Arc::new(AtomicBool::new(false));
        let indexed = pipeline
            .run(lib_id, &norm_root, &mut conn, cancel.clone(), move |ev| {
                events_cb.lock().unwrap().push(ev);
            })
            .unwrap();

        assert_eq!(indexed, 12);

        let recorded = events.lock().unwrap().clone();
        let indexing_events: Vec<&IndexingProgressEvent> = recorded
            .iter()
            .filter(|e| e.stage == "indexing" || e.stage == "completed")
            .collect();
        assert!(!indexing_events.is_empty());

        let mut prev_indexed = 0;
        for ev in indexing_events {
            assert_eq!(ev.scanned_files, 12, "Denominator must stay constant at 12");
            assert!(
                ev.indexed_files <= ev.scanned_files,
                "Indexed files ({}) must never exceed scanned files ({})",
                ev.indexed_files,
                ev.scanned_files
            );
            assert!(
                ev.indexed_files >= prev_indexed,
                "Indexed files must increase monotonically ({} -> {})",
                prev_indexed,
                ev.indexed_files
            );
            prev_indexed = ev.indexed_files;
        }
        assert_eq!(prev_indexed, 12);

        // Simulate one failed thumbnail and two deleted files, then verify re-scan heals & prunes
        conn.execute(
            "UPDATE media_files SET thumbnail_status = 'failed' WHERE file_name = 'photo_00.jpg';",
            [],
        )
        .unwrap();
        std::fs::remove_file(media_dir.join("photo_10.jpg")).unwrap();
        std::fs::remove_file(media_dir.join("photo_11.jpg")).unwrap();

        let rescanned = pipeline
            .run(lib_id, &norm_root, &mut conn, cancel, |_| {})
            .unwrap();
        assert_eq!(rescanned, 10);

        let db_count: i64 = conn
            .query_row("SELECT count(*) FROM media_files;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(db_count, 10, "Deleted files under root_dir must be pruned on re-scan");

        let healed_status: String = conn
            .query_row(
                "SELECT thumbnail_status FROM media_files WHERE file_name = 'photo_00.jpg';",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            healed_status, "pending",
            "Failed thumbnails on unchanged files must reset to pending on re-scan"
        );

        drop(conn);
        let _ = std::fs::remove_dir_all(&temp_root);
    }
}
