pub mod commands;
pub mod db;
pub mod indexer;
pub mod logger;
pub mod metadata;
pub mod models;
pub mod recognition;
pub mod thumbnails;

use std::collections::HashSet;
use std::fs;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, RwLock};
use tauri::http::{header, Response};
use tauri::Manager;

use commands::indexing::AppState;
use db::DatabaseManager;
use thumbnails::{ThumbnailCache, ThumbnailWorker};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Global panic hook: logs thread name, source location, payload, and compact backtrace to file
    std::panic::set_hook(Box::new(|info| {
        let thread_name = std::thread::current()
            .name()
            .unwrap_or("unnamed")
            .to_string();
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".into());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };
        let bt = std::backtrace::Backtrace::force_capture().to_string();
        let compact_bt: String = bt
            .lines()
            .filter(|l| !l.trim().is_empty())
            .take(16)
            .collect::<Vec<_>>()
            .join(" | ");
        let panic_msg = format!(
            "FATAL UNCAUGHT PANIC on thread '{}' at {}: {} [Backtrace: {}]",
            thread_name,
            loc,
            payload,
            compact_bt.chars().take(1600).collect::<String>()
        );
        eprintln!("{}", panic_msg);
        crate::logger::log_panic(&panic_msg);
    }));

    let shutdown_token = Arc::new(AtomicBool::new(false));
    let shutdown_worker = shutdown_token.clone();
    let indexing_cancel_token = Arc::new(AtomicBool::new(false));
    let is_indexing_active = Arc::new(AtomicBool::new(false));
    let failed_hashes: Arc<RwLock<HashSet<String>>> = Arc::new(RwLock::new(HashSet::new()));
    let failed_hashes_proto = failed_hashes.clone();
    let decode_semaphore = Arc::new(tokio::sync::Semaphore::new(4));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("main").map(|w| {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            });
        }))
        .register_asynchronous_uri_scheme_protocol("puntano-thumb", move |ctx, request, responder| {
            let raw_path = request.uri().path().to_string();
            let app_handle = ctx.app_handle().clone();
            let failed_hashes_proto = failed_hashes_proto.clone();
            let decode_semaphore = decode_semaphore.clone();

            tauri::async_runtime::spawn(async move {
                let clean = raw_path.trim_start_matches('/');
                let file_part = clean.strip_prefix("localhost/").unwrap_or(clean);
                let cache_dir = app_handle
                    .path()
                    .app_cache_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));

                // Support cropped face avatar requests: puntano-thumb://face/{face_id}
                if let Some(face_subpath) = file_part.strip_prefix("face/") {
                    let face_id_str = face_subpath.split('?').next().unwrap_or(face_subpath).trim_end_matches(".jpg");
                    if let Ok(face_id) = face_id_str.parse::<i64>() {
                        let face_thumb_dir = cache_dir.join("faces");
                        let face_thumb_file = face_thumb_dir.join(format!("{}.jpg", face_id));

                        if let Ok(bytes) = tokio::fs::read(&face_thumb_file).await {
                            if !bytes.is_empty() {
                                responder.respond(
                                    Response::builder()
                                        .header(header::CONTENT_TYPE, "image/jpeg")
                                        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                                        .body(bytes)
                                        .unwrap(),
                                );
                                return;
                            }
                        }

                        // Bounded on-demand crop so concurrent requests never freeze WebView2
                        let _permit = decode_semaphore.acquire().await.ok();
                        let app_h = app_handle.clone();
                        let resp_bytes = tauri::async_runtime::spawn_blocking(move || -> Option<Vec<u8>> {
                            if let Ok(bytes) = fs::read(&face_thumb_file) {
                                if !bytes.is_empty() {
                                    return Some(bytes);
                                }
                            }
                            let db_path = app_h.path().app_data_dir().map(|d| d.join("puntano.db")).ok()?;
                            let conn = rusqlite::Connection::open(&db_path).ok()?;
                            let (src_path, bx, by, bw, bh, orientation) =
                                crate::db::batch::MediaRepository::get_face_crop_by_id(&conn, face_id).ok()??;
                            let img = image::open(&src_path).ok()?;
                            use image::GenericImageView;
                            let (w, h) = img.dimensions();
                            let pad_x = bw * 0.20;
                            let pad_y = bh * 0.20;
                            let x1 = ((bx - pad_x) * w as f32).max(0.0) as u32;
                            let y1 = ((by - pad_y) * h as f32).max(0.0) as u32;
                            let x2 = ((bx + bw + pad_x) * w as f32).min(w as f32) as u32;
                            let y2 = ((by + bh + pad_y) * h as f32).min(h as f32) as u32;
                            let crop_w = (x2.saturating_sub(x1)).max(1);
                            let crop_h = (y2.saturating_sub(y1)).max(1);
                            let cropped = img.crop_imm(x1, y1, crop_w, crop_h);
                            let thumb = cropped.resize_exact(200, 200, image::imageops::FilterType::Triangle);
                            let thumb = crate::recognition::engine::FaceEngine::apply_orientation(thumb, orientation);
                            let _ = fs::create_dir_all(&face_thumb_dir);
                            let _ = thumb.save(&face_thumb_file);
                            fs::read(&face_thumb_file).ok()
                        })
                        .await
                        .ok()
                        .flatten();

                        if let Some(bytes) = resp_bytes {
                            responder.respond(
                                Response::builder()
                                    .header(header::CONTENT_TYPE, "image/jpeg")
                                    .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                                    .body(bytes)
                                    .unwrap(),
                            );
                            return;
                        }
                    }

                    responder.respond(Response::builder().status(404).body(Vec::new()).unwrap());
                    return;
                }

                let file_hash = file_part
                    .split('?')
                    .next()
                    .unwrap_or(file_part)
                    .trim_end_matches(".jpg")
                    .trim_end_matches(".webp")
                    .to_string();

                let cache = ThumbnailCache::new(&cache_dir);
                let target_file = cache.resolve_path(&file_hash);

                if ThumbnailCache::is_valid_cached_file(&target_file) {
                    if let Ok(bytes) = tokio::fs::read(&target_file).await {
                        if !bytes.is_empty() {
                            let content_type = if target_file.extension().and_then(|s| s.to_str()) == Some("jpg") {
                                "image/jpeg"
                            } else {
                                "image/webp"
                            };
                            responder.respond(
                                Response::builder()
                                    .header(header::CONTENT_TYPE, content_type)
                                    .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                                    .body(bytes)
                                    .unwrap(),
                            );
                            return;
                        }
                    }
                }

                // On-demand extraction fallback: if thumbnail is not yet in cache, try extracting it
                let _permit = decode_semaphore.acquire().await.ok();
                let app_h = app_handle.clone();
                let target_clone = target_file.clone();
                let hash_clone = file_hash.clone();
                let extracted_bytes = tauri::async_runtime::spawn_blocking(move || -> Option<Vec<u8>> {
                    if ThumbnailCache::is_valid_cached_file(&target_clone) {
                        if let Ok(bytes) = fs::read(&target_clone) {
                            if !bytes.is_empty() {
                                return Some(bytes);
                            }
                        }
                    }
                    let db_path = app_h.path().app_data_dir().map(|d| d.join("puntano.db")).ok()?;
                    let conn = rusqlite::Connection::open(&db_path).ok()?;
                    let mut stmt = conn.prepare("SELECT file_path, media_type, duration FROM media_files WHERE file_hash = ?1 LIMIT 1;").ok()?;
                    let (src_path, media_type, duration) = stmt.query_row(rusqlite::params![hash_clone], |r| {
                        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<f64>>(2)?))
                    }).ok()?;
                    let src = std::path::Path::new(&src_path);
                    if !src.exists() {
                        return None;
                    }
                    let extract_res = if media_type == "video" {
                        crate::thumbnails::video_extractor::VideoKeyframeExtractor::extract_keyframe(src, &target_clone, duration)
                    } else {
                        crate::thumbnails::resizer::ThumbnailResizer::generate_photo_thumbnail(src, &target_clone)
                    };
                    if extract_res.is_ok() && ThumbnailCache::is_valid_cached_file(&target_clone) {
                        fs::read(&target_clone).ok()
                    } else {
                        None
                    }
                })
                .await
                .ok()
                .flatten();

                if let Some(bytes) = extracted_bytes {
                    let content_type = if target_file.extension().and_then(|s| s.to_str()) == Some("jpg") {
                        "image/jpeg"
                    } else {
                        "image/webp"
                    };
                    responder.respond(
                        Response::builder()
                            .header(header::CONTENT_TYPE, content_type)
                            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                            .body(bytes)
                            .unwrap(),
                    );
                    return;
                }

                if failed_hashes_proto
                    .read()
                    .map(|set| set.contains(&file_hash))
                    .unwrap_or(false)
                {
                    responder.respond(
                        Response::builder()
                            .status(404)
                            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
                            .header(header::CACHE_CONTROL, "no-store, no-cache")
                            .body(b"Thumbnail generation failed".to_vec())
                            .unwrap(),
                    );
                    return;
                }

                let fallback_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="385" height="289" viewBox="0 0 384 288"><rect width="100%" height="100%" fill="#182234"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="14" font-weight="600">PROCESSING...</text></svg>"##;
                responder.respond(
                    Response::builder()
                        .status(200)
                        .header(header::CONTENT_TYPE, "image/svg+xml")
                        .header(header::CACHE_CONTROL, "no-store, no-cache")
                        .body(fallback_svg.as_bytes().to_vec())
                        .unwrap(),
                );
            });
        })
        .setup(move |app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Locate or create application data & cache directories
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");

            let app_cache_dir = app
                .path()
                .app_cache_dir()
                .expect("Failed to resolve app cache dir");

            if !app_data_dir.exists() {
                fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            }
            if !app_cache_dir.exists() {
                fs::create_dir_all(&app_cache_dir).expect("Failed to create app cache dir");
            }

            // Initialize persistent file logger in app_data_dir/logs/
            let log_dir = app_data_dir.join("logs");
            let _ = crate::logger::init(&log_dir);

            // Log host environment capabilities & free disk space at startup
            let cpu_threads = rayon::current_num_threads();
            let ffmpeg_path = thumbnails::VideoKeyframeExtractor::find_ffmpeg_binary();
            let data_free_mb = commands::diagnostics::get_available_disk_bytes(&app_data_dir)
                .map(|b| b / (1024 * 1024));
            let cache_free_mb = commands::diagnostics::get_available_disk_bytes(&app_cache_dir)
                .map(|b| b / (1024 * 1024));
            log::info!(
                "[Puntano Engine] Host capabilities: rayon_threads={}, ffmpeg={:?}, data_dir_free_mb={:?}, cache_dir_free_mb={:?}",
                cpu_threads,
                ffmpeg_path,
                data_free_mb,
                cache_free_mb
            );
            if let Some(free_mb) = data_free_mb.into_iter().chain(cache_free_mb).min() {
                if free_mb < 500 {
                    log::warn!(
                        "[Puntano Engine] Low disk space detected ({} MB free) on app data/cache drive; SQLite commits or thumbnail caching may fail.",
                        free_mb
                    );
                }
            }

            let db_path = app_data_dir.join("puntano.db");

            // Initialize database schema and verify R*Tree virtual table support (runs migrations ONCE at startup)
            let conn = match DatabaseManager::open_and_migrate(&db_path) {
                Ok(c) => c,
                Err(e) => {
                    log::error!(
                        "[Puntano Engine] CRITICAL: Failed to open or migrate SQLite database at '{}': {}",
                        db_path.display(),
                        e
                    );
                    crate::logger::flush();
                    panic!("Failed to initialize SQLite database: {}", e);
                }
            };
            
            let rtree_ok = DatabaseManager::verify_rtree_support(&conn)
                .unwrap_or(false);
            
            if rtree_ok {
                log::info!("[Puntano Engine] SQLite initialized with R*Tree spatial indexing support enabled.");
            } else {
                log::warn!("[Puntano Engine] WARNING: SQLite R*Tree module was not detected!");
            }

            // Ensure per-library file counts are synchronized with actual media_files records
            let _ = conn.execute(
                "UPDATE libraries SET total_files = (SELECT count(*) FROM media_files WHERE library_id = libraries.id);",
                [],
            );

            // Spawn background decoupled thumbnail generation daemon
            ThumbnailWorker::start_daemon(
                app.handle().clone(),
                db_path.clone(),
                app_cache_dir,
                shutdown_worker,
                failed_hashes.clone(),
            );

            // Spawn background live filesystem watcher for registered library folders
            let watched_libraries = {
                let stmt = conn.prepare("SELECT path FROM libraries WHERE is_active = 1;").ok();
                stmt.map(|mut s| {
                    s.query_map([], |row| row.get::<_, String>(0))
                        .ok()
                        .map(|iter| iter.flatten().map(std::path::PathBuf::from).collect::<Vec<_>>())
                        .unwrap_or_default()
                }).unwrap_or_default()
            };

            let watcher_tx = crate::indexer::LibraryWatcher::start_watching(
                app.handle().clone(),
                db_path.clone(),
                watched_libraries,
                shutdown_token.clone(),
            );

            // Initialize facial recognition worker with dedicated database connection
            let face_db = Arc::new(std::sync::Mutex::new(
                DatabaseManager::open(&db_path).expect("Failed to open DB for face worker")
            ));
            let face_worker = Arc::new(crate::recognition::worker::FaceScanWorker::new(
                face_db,
                app.handle().clone(),
            ));

            app.manage(AppState {
                db_path,
                shutdown_token,
                indexing_cancel_token,
                is_indexing_active,
                failed_hashes,
                watcher_tx: std::sync::Mutex::new(watcher_tx),
                face_worker,
            });

            log::info!("[Puntano Engine] Setup hook completed successfully!");
            crate::logger::flush();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::indexing::start_indexing,
            commands::indexing::cancel_indexing,
            commands::indexing::get_total_media_count,
            commands::indexing::get_libraries,
            commands::indexing::remove_library,
            commands::indexing::prune_missing_files,
            commands::indexing::show_in_folder,
            commands::diagnostics::get_logs,
            commands::diagnostics::get_log_file_path,
            commands::diagnostics::open_log_folder,
            commands::diagnostics::export_logs,
            commands::diagnostics::get_diagnostic_report,
            commands::diagnostics::log_frontend_event,
            commands::diagnostics::prepare_for_update_restart,
            commands::diagnostics::open_release_page,
            commands::media::query_spatial_bounding_box,
            commands::media::query_timeline_groups,
            commands::media::query_media_paged,
            commands::media::search_media,
            commands::media::get_media_item,
            commands::media::query_duplicate_groups,
            commands::media::query_on_this_day_memories,
            commands::media::delete_media_file,
            commands::media::set_media_favorite,
            commands::media::set_media_rating,
            commands::media::create_album,
            commands::media::get_albums,
            commands::media::delete_album,
            commands::media::update_album,
            commands::media::get_media_albums,
            commands::media::add_media_to_album,
            commands::media::remove_media_from_album,
            commands::media::create_tag,
            commands::media::get_tags,
            commands::media::delete_tag,
            commands::media::add_tag_to_media,
            commands::media::remove_tag_from_media,
            commands::media::get_media_tags,
            commands::media::batch_set_media_favorite,
            commands::media::batch_delete_media,
            commands::media::batch_add_tag_to_media,
            commands::media::batch_add_media_to_album,
            commands::media::get_library_stats,
            commands::media::set_media_orientation,
            commands::media::resolve_location_name,
            commands::media::export_media_files,
            commands::people::query_people,
            commands::people::query_person_media,
            commands::people::update_person_name,
            commands::people::merge_people,
            commands::people::get_media_faces,
            commands::people::start_face_scan,
            commands::people::stop_face_scan,
            commands::people::rescan_faces,
            commands::people::get_face_scan_progress,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match &event {
                tauri::RunEvent::Ready => {
                    log::info!("[RunEvent] Ready!");
                    crate::logger::flush();
                }
                tauri::RunEvent::WindowEvent { label, event, .. } => {
                    log::info!("[RunEvent] Window '{}': {:?}", label, event);
                    crate::logger::flush();
                }
                tauri::RunEvent::ExitRequested { code, .. } => {
                    log::info!("[RunEvent] ExitRequested: code={:?}", code);
                    crate::logger::flush();
                }
                tauri::RunEvent::Exit => {
                    log::info!("[RunEvent] App exited!");
                    crate::logger::flush();
                }
                _ => {}
            }
        });
}
