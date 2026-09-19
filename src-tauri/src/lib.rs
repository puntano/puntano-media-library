pub mod commands;
pub mod db;
pub mod indexer;
pub mod metadata;
pub mod models;

use std::fs;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;

use commands::indexing::AppState;
use db::DatabaseManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Locate or create application data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");

            if !app_data_dir.exists() {
                fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            }

            let db_path = app_data_dir.join("puntano.db");

            // Initialize database schema and verify R*Tree virtual table support
            let conn = DatabaseManager::open(&db_path)
                .expect("Failed to initialize SQLite database");
            
            let rtree_ok = DatabaseManager::verify_rtree_support(&conn)
                .unwrap_or(false);
            
            if rtree_ok {
                println!("[Puntano Engine] SQLite initialized with R*Tree spatial indexing support enabled.");
            } else {
                eprintln!("[Puntano Engine] WARNING: SQLite R*Tree module was not detected!");
            }

            app.manage(AppState {
                db_path,
                cancel_token: Arc::new(AtomicBool::new(false)),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::indexing::start_indexing,
            commands::indexing::cancel_indexing,
            commands::indexing::get_total_media_count,
            commands::media::query_spatial_bounding_box,
            commands::media::query_timeline_groups,
            commands::media::query_media_paged,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
