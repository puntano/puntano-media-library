use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::time::Duration;

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::params;
use tauri::{AppHandle, Emitter};

use crate::db::{DatabaseManager, MediaRepository};
use crate::indexer::pipeline::IndexingPipeline;
use crate::metadata::{PhotoMetadataParser, VideoMetadataParser};
use crate::models::MediaItem;

#[derive(Debug, Clone)]
pub enum WatcherCommand {
    Watch(PathBuf),
    Unwatch(PathBuf),
}

pub struct LibraryWatcher;

impl LibraryWatcher {
    /// Spawns a cross-platform live directory watcher for watched libraries.
    /// Utilizes ReadDirectoryChangesW on Windows and FSEvents on macOS with dynamic path registration.
    pub fn start_watching(
        app_handle: AppHandle,
        db_path: PathBuf,
        watched_paths: Vec<PathBuf>,
        shutdown_token: Arc<AtomicBool>,
    ) -> Sender<WatcherCommand> {
        let (cmd_tx, cmd_rx) = std::sync::mpsc::channel::<WatcherCommand>();

        std::thread::Builder::new()
            .name("library-watcher".into())
            .spawn(move || {
                let (tx, rx) = std::sync::mpsc::channel();

                let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
                    Ok(w) => w,
                    Err(e) => {
                        log::error!("[LibraryWatcher] Failed to initialize watcher: {}", e);
                        return;
                    }
                };

                let mut watched_set: HashSet<PathBuf> = HashSet::new();

                for raw_path in watched_paths {
                    let path = crate::indexer::walker::DirectoryWalker::normalize_existing_path(&raw_path);
                    if path.exists() && !watched_set.contains(&path) {
                        if watcher.watch(&path, RecursiveMode::Recursive).is_ok() {
                            log::info!("[LibraryWatcher] Monitoring directory: {:?}", path);
                            watched_set.insert(path);
                        }
                    }
                }

                while !shutdown_token.load(Ordering::Relaxed) {
                    // Process any dynamic Watch / Unwatch commands
                    while let Ok(cmd) = cmd_rx.try_recv() {
                        match cmd {
                            WatcherCommand::Watch(raw_path) => {
                                let path = crate::indexer::walker::DirectoryWalker::normalize_existing_path(&raw_path);
                                if path.exists() && !watched_set.contains(&path) {
                                    if watcher.watch(&path, RecursiveMode::Recursive).is_ok() {
                                        log::info!("[LibraryWatcher] Dynamically watching directory: {:?}", path);
                                        watched_set.insert(path);
                                    }
                                }
                            }
                            WatcherCommand::Unwatch(raw_path) => {
                                let path = crate::indexer::walker::DirectoryWalker::strip_verbatim_prefix(
                                    crate::indexer::walker::DirectoryWalker::sanitize_path(&raw_path),
                                );
                                if watched_set.remove(&path) || watched_set.remove(&raw_path) {
                                    let _ = watcher.unwatch(&path);
                                    log::info!("[LibraryWatcher] Stopped watching directory: {:?}", path);
                                }
                            }
                        }
                    }

                    if let Ok(Ok(event)) = rx.recv_timeout(Duration::from_millis(300)) {
                        Self::handle_fs_event(&app_handle, &db_path, event);
                    }
                }

                log::info!("[LibraryWatcher] Shutting down live filesystem watcher.");
            })
            .expect("Failed to spawn library watcher thread");

        cmd_tx
    }

    fn handle_fs_event(app_handle: &AppHandle, db_path: &Path, event: Event) {
        let mut conn = match DatabaseManager::open(db_path) {
            Ok(c) => c,
            Err(_) => return,
        };

        for path in event.paths {
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) => {
                    if !Self::is_supported_media(&path) {
                        continue;
                    }
                    if crate::indexer::walker::DirectoryWalker::should_ignore_path(&path) {
                        continue;
                    }
                    let normalized = crate::indexer::walker::DirectoryWalker::normalize_existing_path(&path);
                    Self::sync_single_file(app_handle, &mut conn, &normalized);
                }
                EventKind::Remove(_) => {
                    let clean_path = crate::indexer::walker::DirectoryWalker::strip_verbatim_prefix(
                        crate::indexer::walker::DirectoryWalker::sanitize_path(&path),
                    );
                    let path_str = clean_path.to_string_lossy().to_string();
                    let sep = std::path::MAIN_SEPARATOR;
                    let prefix_pattern = format!("{}{}%", path_str.trim_end_matches(['\\', '/']), sep);

                    let removed = conn
                        .execute(
                            "DELETE FROM media_files WHERE file_path = ?1 OR directory = ?1 OR directory LIKE ?2;",
                            params![path_str, prefix_pattern],
                        )
                        .unwrap_or(0);

                    if removed > 0 {
                        let _ = conn.execute(
                            "UPDATE libraries SET total_files = (SELECT count(*) FROM media_files WHERE library_id = libraries.id);",
                            [],
                        );
                        let _ = app_handle.emit("library-incremental-sync", path_str);
                    }
                }
                _ => {}
            }
        }
    }

    fn path_is_within_library(file_path: &str, lib_path: &str) -> bool {
        let lib_trimmed = lib_path.trim_end_matches(['\\', '/']);
        #[cfg(windows)]
        let (f_cmp, l_cmp) = (file_path.to_lowercase(), lib_trimmed.to_lowercase());
        #[cfg(not(windows))]
        let (f_cmp, l_cmp) = (file_path.to_string(), lib_trimmed.to_string());

        if f_cmp == l_cmp {
            return true;
        }
        if let Some(rest) = f_cmp.strip_prefix(&l_cmp) {
            return rest.starts_with('\\') || rest.starts_with('/');
        }
        false
    }

    fn sync_single_file(app_handle: &AppHandle, conn: &mut rusqlite::Connection, path: &Path) {
        let metadata = match path.metadata() {
            Ok(m) if m.is_file() => m,
            _ => return,
        };

        let file_size = metadata.len() as i64;
        if file_size <= 0 {
            return;
        }

        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let path_str = path.to_string_lossy().to_string();

        // Check if file is already indexed and unchanged
        if let Ok(true) = MediaRepository::is_file_unchanged(conn, &path_str, mtime, file_size) {
            return;
        }

        // Dynamically match against the most specific registered active library
        let library_opt: Option<i64> = {
            let stmt = conn.prepare_cached("SELECT id, path FROM libraries WHERE is_active = 1;").ok();
            stmt.and_then(|mut s| {
                s.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
                    .ok()
                    .and_then(|iter| {
                        iter.flatten()
                            .filter(|(_, lib_path)| Self::path_is_within_library(&path_str, lib_path))
                            .max_by_key(|(_, lib_path)| lib_path.len())
                            .map(|(id, _)| id)
                    })
            })
        };

        let Some(library_id) = library_opt else {
            return;
        };

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let (media_type, mime_type) = crate::indexer::walker::DirectoryWalker::classify_media(&ext);
        let is_video = media_type == "video";

        let hash = IndexingPipeline::compute_fast_hash(path, file_size);
        let now = chrono::Utc::now().timestamp_millis();

        let mut item = MediaItem {
            id: None,
            library_id,
            file_path: path_str.clone(),
            directory: path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
            file_name: path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
            file_size,
            file_modified_at: mtime,
            file_hash: hash,
            mime_type,
            media_type,
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

        let parse_path = path.to_path_buf();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            if is_video {
                let v = VideoMetadataParser::parse(&parse_path);
                item.width = v.width;
                item.height = v.height;
                item.duration = v.duration;
                item.captured_at = v.captured_at;
                item.captured_at_local = v.captured_at_local;
                item.latitude = v.latitude;
                item.longitude = v.longitude;
                item.altitude = v.altitude;
            } else {
                let p = PhotoMetadataParser::parse(&parse_path);
                item.width = p.width;
                item.height = p.height;
                item.orientation = p.orientation;
                item.captured_at = p.captured_at;
                item.captured_at_local = p.captured_at_local;
                item.timezone_offset = p.timezone_offset;
                item.latitude = p.latitude;
                item.longitude = p.longitude;
                item.altitude = p.altitude;
                item.camera_make = p.camera_make;
                item.camera_model = p.camera_model;
                item.lens_model = p.lens_model;
                item.focal_length = p.focal_length;
                item.aperture = p.aperture;
                item.iso = p.iso;
                item.exposure_time = p.exposure_time;
            }
        }));

        if let (Some(lat), Some(lon)) = (item.latitude, item.longitude) {
            item.geohash = Some(IndexingPipeline::encode_geohash(lat, lon, 7));
        }

        // Insert into database using the active WAL connection
        let _ = MediaRepository::insert_batch(conn, &[item]);
        let _ = conn.execute(
            "UPDATE libraries SET total_files = (SELECT count(*) FROM media_files WHERE library_id = ?1) WHERE id = ?1;",
            params![library_id],
        );
        let _ = app_handle.emit("library-incremental-sync", path_str);
    }

    pub fn is_supported_media(path: &Path) -> bool {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        crate::indexer::walker::SUPPORTED_EXTENSIONS.contains(&ext.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_supported_extensions_consistency() {
        for ext in crate::indexer::walker::SUPPORTED_EXTENSIONS {
            let p = PathBuf::from(format!("sample_file.{}", ext));
            assert!(
                LibraryWatcher::is_supported_media(&p),
                "Watcher should support extension: {}",
                ext
            );
        }

        let txt = PathBuf::from("notes.txt");
        let exe = PathBuf::from("run.exe");
        assert!(!LibraryWatcher::is_supported_media(&txt));
        assert!(!LibraryWatcher::is_supported_media(&exe));
    }
}
