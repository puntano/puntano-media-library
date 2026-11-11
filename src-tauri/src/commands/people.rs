use tauri::State;

use super::indexing::AppState;
use crate::db::{DatabaseManager, MediaRepository};
use crate::models::{MediaFace, MediaItem, Person};
use crate::recognition::worker::FaceScanProgress;

#[tauri::command]
pub fn query_people(state: State<'_, AppState>) -> Result<Vec<Person>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::query_people(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_person_media(
    state: State<'_, AppState>,
    person_id: i64,
) -> Result<Vec<MediaItem>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::query_person_media(&conn, person_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_person_name(
    state: State<'_, AppState>,
    person_id: i64,
    name: Option<String>,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::update_person_name(&conn, person_id, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn merge_people(
    state: State<'_, AppState>,
    target_person_id: i64,
    source_person_ids: Vec<i64>,
) -> Result<(), String> {
    let mut conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::merge_people(&mut conn, target_person_id, &source_person_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_media_faces(
    state: State<'_, AppState>,
    media_id: i64,
) -> Result<Vec<MediaFace>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::get_media_faces(&conn, media_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_face_scan(state: State<'_, AppState>) -> Result<bool, String> {
    state.face_worker.start_scan()
}

#[tauri::command]
pub fn stop_face_scan(state: State<'_, AppState>) -> Result<(), String> {
    state.face_worker.stop();
    Ok(())
}

#[tauri::command]
pub fn get_face_scan_progress(state: State<'_, AppState>) -> Result<FaceScanProgress, String> {
    state.face_worker.get_progress()
}
