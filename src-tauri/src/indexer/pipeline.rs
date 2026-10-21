use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver, Sender};
use rayon::prelude::*;
use rusqlite::Connection;
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
        Self { batch_size: 500 }
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

        // Differential check: skip files whose (file_modified_at, file_size) already match the database
        let existing_signatures = MediaRepository::get_indexed_file_signatures(conn, library_id)
            .unwrap_or_default();

        let files_to_process: Vec<_> = discovered
            .into_iter()
            .filter(|file| {
                let path_str = file.path.to_string_lossy();
                match existing_signatures.get(path_str.as_ref()) {
                    Some(&(mtime, size)) => mtime != file.file_modified_at || size != file.file_size,
                    None => true,
                }
            })
            .collect();

        let unchanged_count = total_discovered.saturating_sub(files_to_process.len() as u64);

        if files_to_process.is_empty() {
            log::info!(
                "Differential scan complete for '{}': all {} files are unchanged ({}ms).",
                root_dir,
                total_discovered,
                start_time.elapsed().as_millis()
            );
            progress_callback(IndexingProgressEvent {
                stage: "completed".into(),
                scanned_files: total_discovered,
                indexed_files: total_discovered,
                current_directory: root_dir.to_string(),
                is_complete: true,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
            });
            return Ok(total_discovered);
        }

        log::info!(
            "Discovery complete for '{}': {} files found ({} unchanged, {} new/modified) in {}ms. Starting metadata extraction & SQLite ingestion.",
            root_dir,
            total_discovered,
            unchanged_count,
            files_to_process.len(),
            start_time.elapsed().as_millis()
        );

        // Bounded channel to prevent uncontrolled memory spikes during large library scans
        let (tx, rx): (Sender<MediaItem>, Receiver<MediaItem>) = bounded(1000);
        let indexed_counter = Arc::new(AtomicU64::new(unchanged_count));
        let scanned_counter = Arc::new(AtomicU64::new(unchanged_count));
        let cancel = cancel_token.clone();

        // 2. Stage 2: Parallel Metadata Extraction (Rayon Worker Pool)
        let tx_clone = tx.clone();
        let scanned_clone = scanned_counter.clone();

        std::thread::spawn(move || {
            files_to_process.into_par_iter().for_each(|file| {
                if cancel.load(Ordering::Relaxed) {
                    return;
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
                let media_type = file.media_type.clone();

                // Safe wrapper to prevent any potential third-party parser panic from crashing threads
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
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

                // Compute coarse geohash if coordinates present
                if let (Some(lat), Some(lon)) = (item.latitude, item.longitude) {
                    item.geohash = Some(Self::encode_geohash(lat, lon, 7));
                }

                let _ = tx_clone.send(item);
                scanned_clone.fetch_add(1, Ordering::Relaxed);
            });

            // Dropping tx_clone signals completion to rx
        });

        // Drop original tx so rx knows when all sender threads terminate
        drop(tx);

        // 3. Stage 3: Dedicated Transactional Batch Ingestion (Writer)
        let mut batch = Vec::with_capacity(self.batch_size);
        let mut total_indexed: u64 = unchanged_count;
        let mut last_progress_report = Instant::now();

        while let Ok(item) = rx.recv() {
            if cancel_token.load(Ordering::Relaxed) {
                break;
            }

            batch.push(item);

            if batch.len() >= self.batch_size {
                if let Err(e) = MediaRepository::insert_batch(conn, &batch) {
                    return Err(format!("Batch insertion failed: {}", e));
                }
                total_indexed += batch.len() as u64;
                indexed_counter.store(total_indexed, Ordering::Relaxed);
                batch.clear();
            }

            // Throttled progress reporting (every 50ms) to ensure smooth 60fps UI
            if last_progress_report.elapsed() > Duration::from_millis(50) {
                progress_callback(IndexingProgressEvent {
                    stage: "indexing".into(),
                    scanned_files: scanned_counter.load(Ordering::Relaxed),
                    indexed_files: total_indexed,
                    current_directory: root_dir.to_string(),
                    is_complete: false,
                    elapsed_ms: start_time.elapsed().as_millis() as u64,
                });
                last_progress_report = Instant::now();
            }
        }

        // Flush remaining items
        if !batch.is_empty() && !cancel_token.load(Ordering::Relaxed) {
            if let Err(e) = MediaRepository::insert_batch(conn, &batch) {
                return Err(format!("Final batch insertion failed: {}", e));
            }
            total_indexed += batch.len() as u64;
        }

        log::info!(
            "Indexing pipeline successfully completed for library {}: {} items indexed in {}ms.",
            library_id,
            total_indexed,
            start_time.elapsed().as_millis()
        );

        // Final completion event
        progress_callback(IndexingProgressEvent {
            stage: "completed".into(),
            scanned_files: scanned_counter.load(Ordering::Relaxed),
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
}
