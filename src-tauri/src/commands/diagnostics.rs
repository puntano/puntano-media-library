use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use tauri::State;

use crate::commands::indexing::AppState;
use crate::db::DatabaseManager;
use crate::logger;

#[derive(Debug, Serialize)]
pub struct DiagnosticReport {
    pub app_version: String,
    pub os_name: String,
    pub os_family: String,
    pub arch: String,
    pub db_path: String,
    pub db_size_bytes: u64,
    pub log_file_path: String,
    pub total_libraries: usize,
    pub total_media_files: i64,
    pub recent_logs: Vec<String>,
}

#[tauri::command]
pub fn get_logs(max_lines: Option<usize>) -> Result<Vec<String>, String> {
    let limit = max_lines.unwrap_or(150);
    Ok(logger::get_recent_logs(limit))
}

#[tauri::command]
pub fn get_log_file_path() -> Result<String, String> {
    logger::get_log_file_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Log file path is not available".to_string())
}

#[tauri::command]
pub fn open_log_folder() -> Result<(), String> {
    let log_path = logger::get_log_file_path()
        .ok_or_else(|| "Log file path is not available".to_string())?;

    let folder = log_path.parent().unwrap_or(&log_path);

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(folder)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(folder)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn export_logs(destination_path: String) -> Result<String, String> {
    let log_path = logger::get_log_file_path()
        .ok_or_else(|| "Log file path is not available".to_string())?;

    if !log_path.exists() {
        return Err("Log file does not exist yet".to_string());
    }

    let dest = PathBuf::from(destination_path.trim().trim_matches('"'));
    fs::copy(&log_path, &dest)
        .map_err(|e| format!("Failed to copy log file to destination: {}", e))?;

    log::info!("Logs exported successfully to '{}'", dest.display());
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_diagnostic_report(state: State<'_, AppState>) -> Result<DiagnosticReport, String> {
    let log_path_str = logger::get_log_file_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "N/A".to_string());

    let db_size_bytes = fs::metadata(&state.db_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let mut total_libraries = 0;
    let mut total_media_files = 0;

    if let Ok(conn) = DatabaseManager::open(&state.db_path) {
        if let Ok(libs_count) = conn.query_row("SELECT count(*) FROM libraries;", [], |r| r.get(0)) {
            total_libraries = libs_count;
        }
        if let Ok(media_count) = conn.query_row("SELECT count(*) FROM media_files;", [], |r| r.get(0)) {
            total_media_files = media_count;
        }
    }

    Ok(DiagnosticReport {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_name: std::env::consts::OS.to_string(),
        os_family: std::env::consts::FAMILY.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        db_size_bytes,
        log_file_path: log_path_str,
        total_libraries,
        total_media_files,
        recent_logs: logger::get_recent_logs(80),
    })
}
