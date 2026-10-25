use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::commands::indexing::AppState;
use crate::db::DatabaseManager;
use crate::logger;
use crate::thumbnails::VideoKeyframeExtractor;

#[derive(Debug, Serialize)]
pub struct DiagnosticReport {
    pub app_version: String,
    pub os_name: String,
    pub os_family: String,
    pub arch: String,
    pub cpu_threads: usize,
    pub ffmpeg_available: bool,
    pub db_path: String,
    pub db_size_bytes: u64,
    pub db_free_space_bytes: Option<u64>,
    pub cache_dir_path: String,
    pub log_file_path: String,
    pub total_libraries: usize,
    pub registered_libraries: Vec<String>,
    pub total_media_files: i64,
    pub photos_count: i64,
    pub raw_count: i64,
    pub videos_count: i64,
    pub duplicate_extra_files: i64,
    pub thumbnails_ready: i64,
    pub thumbnails_pending: i64,
    pub thumbnails_failed: i64,
    pub top_extensions: Vec<String>,
    pub critical_alerts: Vec<String>,
    pub recent_logs: Vec<String>,
}

/// Queries available free bytes on the volume containing `path` (walks up to an existing ancestor directory).
pub fn get_available_disk_bytes(path: &Path) -> Option<u64> {
    let mut target = path;
    while !target.exists() {
        target = target.parent()?;
    }
    if target.is_file() {
        target = target.parent().unwrap_or(target);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        let clean_str = target.to_string_lossy();
        let clean_path = if let Some(rest) = clean_str.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{}", rest)
        } else if let Some(rest) = clean_str.strip_prefix(r"\\?\") {
            rest.to_string()
        } else {
            clean_str.into_owned()
        };

        let wide: Vec<u16> = std::ffi::OsStr::new(&clean_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut free_available = 0u64;
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                PCWSTR(wide.as_ptr()),
                Some(&mut free_available),
                None,
                None,
            )
        };
        if ok.is_ok() {
            return Some(free_available);
        }
        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("df")
            .args(["-Pk", &target.to_string_lossy()])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let data_line = text.lines().nth(1)?;
        let avail_kib: u64 = data_line.split_whitespace().nth(3)?.parse().ok()?;
        Some(avail_kib.saturating_mul(1024))
    }
}

#[tauri::command]
pub fn log_frontend_event(level: String, source: String, message: String) {
    logger::log_frontend(&level, &source, &message);
}

/// Gracefully stops background daemons, checkpoints SQLite WAL, and flushes logs prior to applying an in-app update.
#[tauri::command]
pub fn prepare_for_update_restart(
    target_version: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    log::info!(
        "[Updater] Preparing graceful daemon shutdown & SQLite WAL checkpoint for update to v{}...",
        target_version
    );

    state.indexing_cancel_token.store(true, Ordering::SeqCst);
    state.shutdown_token.store(true, Ordering::SeqCst);

    if let Ok(conn) = DatabaseManager::open(&state.db_path) {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }

    logger::flush();
    Ok(())
}

/// Opens an official Puntano GitHub Releases page in the user's system browser.
#[tauri::command]
pub fn open_release_page(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("https://github.com/puntano/puntano-media-library")
        || trimmed.chars().any(|c| c.is_whitespace() || c == '"' || c == '\'')
    {
        return Err("Blocked untrusted external URL".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }

    Ok(())
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

    logger::flush();
    let dest = PathBuf::from(destination_path.trim().trim_matches('"'));
    fs::copy(&log_path, &dest)
        .map_err(|e| format!("Failed to copy log file to destination: {}", e))?;

    log::info!("Logs exported successfully to '{}'", dest.display());
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_diagnostic_report(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DiagnosticReport, String> {
    logger::flush();

    let log_path_str = logger::get_log_file_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "N/A".to_string());

    let cache_dir_path = app
        .path()
        .app_cache_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "N/A".to_string());

    let db_size_bytes = fs::metadata(&state.db_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let db_free_space_bytes = get_available_disk_bytes(&state.db_path);
    let ffmpeg_available = VideoKeyframeExtractor::find_ffmpeg_binary().is_some();
    let cpu_threads = rayon::current_num_threads();

    let mut total_libraries = 0;
    let mut registered_libraries = Vec::new();
    let mut total_media_files = 0;
    let mut photos_count = 0;
    let mut raw_count = 0;
    let mut videos_count = 0;
    let mut duplicate_extra_files = 0;
    let mut thumbnails_ready = 0;
    let mut thumbnails_pending = 0;
    let mut thumbnails_failed = 0;
    let mut top_extensions = Vec::new();

    if let Ok(conn) = DatabaseManager::open(&state.db_path) {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT l.id, l.path, l.is_active, (SELECT count(*) FROM media_files m WHERE m.library_id = l.id)
             FROM libraries l
             ORDER BY l.id ASC;",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)? == 1,
                    r.get::<_, i64>(3)?,
                ))
            }) {
                for row in rows.flatten() {
                    let status = if row.2 { "active" } else { "inactive" };
                    registered_libraries.push(format!(
                        "[#{}] {} ({} files, {})",
                        row.0, row.1, row.3, status
                    ));
                }
                total_libraries = registered_libraries.len();
            }
        }

        if let Ok(media_count) = conn.query_row("SELECT count(*) FROM media_files;", [], |r| r.get(0)) {
            total_media_files = media_count;
        }

        if let Ok(mut stmt) = conn.prepare("SELECT media_type, count(*) FROM media_files GROUP BY media_type;") {
            if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))) {
                for (mtype, cnt) in rows.flatten() {
                    match mtype.as_str() {
                        "photo" => photos_count = cnt,
                        "raw" => raw_count = cnt,
                        "video" => videos_count = cnt,
                        _ => {}
                    }
                }
            }
        }

        if let Ok(dupes) = conn.query_row(
            "SELECT COALESCE(count(*) - count(DISTINCT file_hash), 0) FROM media_files;",
            [],
            |r| r.get(0),
        ) {
            duplicate_extra_files = dupes;
        }

        if let Ok(mut stmt) = conn.prepare("SELECT thumbnail_status, count(*) FROM media_files GROUP BY thumbnail_status;") {
            if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))) {
                for (status, cnt) in rows.flatten() {
                    match status.as_str() {
                        "ready" => thumbnails_ready = cnt,
                        "pending" => thumbnails_pending = cnt,
                        "failed" => thumbnails_failed = cnt,
                        _ => {}
                    }
                }
            }
        }

        if let Ok(mut stmt) = conn.prepare("SELECT file_name FROM media_files;") {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                let mut ext_counts: HashMap<String, usize> = HashMap::new();
                for name in rows.flatten() {
                    let ext = Path::new(&name)
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| format!(".{}", e.to_ascii_lowercase()))
                        .unwrap_or_else(|| "(none)".to_string());
                    *ext_counts.entry(ext).or_insert(0) += 1;
                }
                let mut ext_vec: Vec<(String, usize)> = ext_counts.into_iter().collect();
                ext_vec.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
                top_extensions = ext_vec
                    .into_iter()
                    .take(8)
                    .map(|(ext, cnt)| format!("{} ({})", ext, cnt))
                    .collect();
            }
        }
    }

    Ok(DiagnosticReport {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_name: std::env::consts::OS.to_string(),
        os_family: std::env::consts::FAMILY.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_threads,
        ffmpeg_available,
        db_path: state.db_path.to_string_lossy().to_string(),
        db_size_bytes,
        db_free_space_bytes,
        cache_dir_path,
        log_file_path: log_path_str,
        total_libraries,
        registered_libraries,
        total_media_files,
        photos_count,
        raw_count,
        videos_count,
        duplicate_extra_files,
        thumbnails_ready,
        thumbnails_pending,
        thumbnails_failed,
        top_extensions,
        critical_alerts: logger::get_sticky_alerts(60),
        recent_logs: logger::get_recent_logs(150),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_available_disk_bytes_positive() {
        let non_existent_child = std::env::temp_dir().join("puntano_nonexistent_probe_file.db");
        let free = get_available_disk_bytes(&non_existent_child);
        assert!(
            free.is_some() && free.unwrap() > 0,
            "Expected positive available disk bytes for temp dir, got {:?}",
            free
        );
    }
}
