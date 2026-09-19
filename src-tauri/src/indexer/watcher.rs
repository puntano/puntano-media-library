use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::params;
use tauri::{AppHandle, Emitter};

use crate::db::{DatabaseManager, MediaRepository};
use crate::indexer::pipeline::IndexingPipeline;
use crate::metadata::{PhotoMetadataParser, VideoMetadataParser};
use crate::models::MediaItem;

pub struct LibraryWatcher;

impl LibraryWatcher {
    /// Spawns a cross-platform live directory watcher for watched libraries.
    /// Utilizes ReadDirectoryChangesW on Windows and FSEvents on macOS with debouncing.
    pub fn start_watching(
        app_handle: AppHandle,
        db_path: PathBuf,
        watched_paths: Vec<PathBuf>,
        cancel_token: Arc<AtomicBool>,
    ) {
        if watched_paths.is_empty() {
            return;
        }

        std::thread::Builder::new()
            .name("library-watcher".into())
            .spawn(move || {
                let (tx, rx) = std::sync::mpsc::channel();

                let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
                    Ok(w) => w,
                    Err(e) => {
                        eprintln!("[LibraryWatcher] Failed to initialize watcher: {}", e);
                        return;
                    }
                };

                for path in &watched_paths {
                    if path.exists() {
                        let _ = watcher.watch(path, RecursiveMode::Recursive);
                        println!("[LibraryWatcher] Monitoring directory: {:?}", path);
                    }
                }

                while !cancel_token.load(Ordering::Relaxed) {
                    if let Ok(Ok(event)) = rx.recv_timeout(Duration::from_millis(500)) {
                        Self::handle_fs_event(&app_handle, &db_path, event);
                    }
                }
            })
            .expect("Failed to spawn library watcher thread");
    }

    fn handle_fs_event(app_handle: &AppHandle, db_path: &Path, event: Event) {
        let conn = match DatabaseManager::open(db_path) {
            Ok(c) => c,
            Err(_) => return,
        };

        for path in event.paths {
            if !Self::is_supported_media(&path) {
                continue;
            }

            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) => {
                    Self::sync_single_file(app_handle, &conn, &path);
                }
                EventKind::Remove(_) => {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = conn.execute(
                        "DELETE FROM media_files WHERE file_path = ?1;",
                        params![path_str],
                    );
                    let _ = app_handle.emit("library-incremental-sync", path_str);
                }
                _ => {}
            }
        }
    }

    fn sync_single_file(app_handle: &AppHandle, conn: &rusqlite::Connection, path: &Path) {
        let metadata = match path.metadata() {
            Ok(m) => m,
            Err(_) => return,
        };

        let file_size = metadata.len() as i64;
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

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let is_video = matches!(ext.as_str(), "mp4" | "mov" | "m4v" | "mkv" | "webm" | "avi");
        let media_type = if is_video { "video" } else { "photo" };
        let mime_type = if is_video { "video/mp4" } else { "image/jpeg" };

        let hash = IndexingPipeline::compute_fast_hash(path, file_size);
        let now = chrono::Utc::now().timestamp_millis();

        let mut item = MediaItem {
            id: None,
            library_id: 1,
            file_path: path_str.clone(),
            directory: path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
            file_name: path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
            file_size,
            file_modified_at: mtime,
            file_hash: hash,
            mime_type: mime_type.into(),
            media_type: media_type.into(),
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
            indexed_at: now,
            updated_at: now,
        };

        if is_video {
            let v = VideoMetadataParser::parse(path);
            item.width = v.width;
            item.height = v.height;
            item.duration = v.duration;
            item.captured_at = v.captured_at;
            item.latitude = v.latitude;
            item.longitude = v.longitude;
        } else {
            let p = PhotoMetadataParser::parse(path);
            item.width = p.width;
            item.height = p.height;
            item.captured_at = p.captured_at;
            item.latitude = p.latitude;
            item.longitude = p.longitude;
            item.camera_make = p.camera_make;
            item.camera_model = p.camera_model;
        }

        // Insert into database
        let mut mut_conn = match rusqlite::Connection::open(conn.path().unwrap_or("")) {
            Ok(c) => c,
            Err(_) => return,
        };
        let _ = MediaRepository::insert_batch(&mut mut_conn, &[item]);
        let _ = app_handle.emit("library-incremental-sync", path_str);
    }

    fn is_supported_media(path: &Path) -> bool {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        matches!(
            ext.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "heic" | "heif" | "dng" | "cr2" | "arw" | "mp4" | "mov" | "mkv"
        )
    }
}
