pub mod commands;
pub mod db;
pub mod indexer;
pub mod metadata;
pub mod models;
pub mod thumbnails;

use std::fs;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::http::{header, Response};
use tauri::Manager;

use commands::indexing::AppState;
use db::DatabaseManager;
use thumbnails::{ThumbnailCache, ThumbnailWorker};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cancel_token = Arc::new(AtomicBool::new(false));
    let cancel_worker = cancel_token.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .register_uri_scheme_protocol("puntano-thumb", move |ctx, request| {
            // Stream thumbnail directly from disk cache to WebViews with zero IPC serialization
            let raw_path = request.uri().path();
            let clean = raw_path.trim_start_matches('/');
            let file_part = clean.strip_prefix("localhost/").unwrap_or(clean);
            let file_hash = file_part
                .trim_end_matches(".jpg")
                .trim_end_matches(".webp");

            let app_handle = ctx.app_handle();
            let cache_dir = app_handle
                .path()
                .app_cache_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            let cache = ThumbnailCache::new(&cache_dir);
            let target_file = cache.resolve_path(file_hash);

            if target_file.exists() {
                if let Ok(bytes) = fs::read(&target_file) {
                    let content_type = if target_file.extension().and_then(|s| s.to_str()) == Some("jpg") {
                        "image/jpeg"
                    } else {
                        "image/webp"
                    };
                    return Response::builder()
                        .header(header::CONTENT_TYPE, content_type)
                        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                        .body(bytes)
                        .unwrap();
                }
            }

            // High-speed non-blocking SVG placeholder while generation is processed by daemon.
            // Avoids blocking Tauri webview asset threads or stalling the UI with synchronous image decoding.
            let fallback_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="384" height="288" viewBox="0 0 384 288"><rect width="100%" height="100%" fill="#182234"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="14" font-weight="600">PROCESSING...</text></svg>"##;
            Response::builder()
                .status(200)
                .header(header::CONTENT_TYPE, "image/svg+xml")
                .header(header::CACHE_CONTROL, "no-cache")
                .body(fallback_svg.as_bytes().to_vec())
                .unwrap()
        })
        .setup(move |app| {
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

            let db_path = app_data_dir.join("puntano.db");

            // Initialize database schema and verify R*Tree virtual table support (runs migrations ONCE at startup)
            let conn = DatabaseManager::open_and_migrate(&db_path)
                .expect("Failed to initialize SQLite database");
            
            let rtree_ok = DatabaseManager::verify_rtree_support(&conn)
                .unwrap_or(false);
            
            if rtree_ok {
                println!("[Puntano Engine] SQLite initialized with R*Tree spatial indexing support enabled.");
            } else {
                eprintln!("[Puntano Engine] WARNING: SQLite R*Tree module was not detected!");
            }

            // Spawn background decoupled thumbnail generation daemon
            ThumbnailWorker::start_daemon(
                db_path.clone(),
                app_cache_dir,
                cancel_worker,
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

            crate::indexer::LibraryWatcher::start_watching(
                app.handle().clone(),
                db_path.clone(),
                watched_libraries,
                cancel_token.clone(),
            );

            app.manage(AppState {
                db_path,
                cancel_token,
            });

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
            commands::media::query_spatial_bounding_box,
            commands::media::query_timeline_groups,
            commands::media::query_media_paged,
            commands::media::search_media,
            commands::media::get_media_item,
            commands::media::query_duplicate_groups,
            commands::media::delete_media_file,
            commands::media::set_media_favorite,
            commands::media::set_media_rating,
            commands::media::create_album,
            commands::media::get_albums,
            commands::media::delete_album,
            commands::media::add_media_to_album,
            commands::media::remove_media_from_album,
            commands::media::create_tag,
            commands::media::get_tags,
            commands::media::delete_tag,
            commands::media::add_tag_to_media,
            commands::media::remove_tag_from_media,
            commands::media::get_media_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
