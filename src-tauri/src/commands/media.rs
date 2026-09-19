use tauri::State;

use super::indexing::AppState;
use crate::db::{DatabaseManager, MediaRepository};
use crate::models::{MediaItem, SpatialBoundingBox, SpatialClusterPoint, TimelineGroup};

#[tauri::command]
pub fn query_spatial_bounding_box(
    state: State<'_, AppState>,
    min_lat: f64,
    max_lat: f64,
    min_lon: f64,
    max_lon: f64,
    limit: Option<u32>,
) -> Result<Vec<SpatialClusterPoint>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    let bbox = SpatialBoundingBox {
        min_lat,
        max_lat,
        min_lon,
        max_lon,
    };

    MediaRepository::query_by_bounding_box(&conn, &bbox, limit.unwrap_or(20000))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_timeline_groups(
    state: State<'_, AppState>,
) -> Result<Vec<TimelineGroup>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::query_timeline_groups(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_media_paged(
    state: State<'_, AppState>,
    limit: u32,
    offset: u32,
) -> Result<Vec<MediaItem>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::query_media_paged(&conn, limit, offset).map_err(|e| e.to_string())
}
