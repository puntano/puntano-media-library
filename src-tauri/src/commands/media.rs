use tauri::State;

use super::indexing::AppState;
use crate::db::{DatabaseManager, MediaRepository};
use crate::models::{
    Album, DuplicateGroup, LibraryStats, MediaFilterQuery, MediaItem, SpatialBoundingBox, SpatialClusterPoint,
    Tag, TimelineGroup,
};

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

#[tauri::command]
pub fn search_media(
    state: State<'_, AppState>,
    query: MediaFilterQuery,
) -> Result<Vec<MediaItem>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::search_media(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_media_item(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<MediaItem>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;

    MediaRepository::get_by_id(&conn, id).map_err(|e| e.to_string())
}

// --------------------------------------------------------------------------
// Duplicates Detection & File Management Commands
// --------------------------------------------------------------------------

#[tauri::command]
pub fn query_duplicate_groups(
    state: State<'_, AppState>,
) -> Result<Vec<DuplicateGroup>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::query_duplicate_groups(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_media_file(
    state: State<'_, AppState>,
    id: i64,
    delete_from_disk: bool,
) -> Result<Option<String>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::delete_media_file(&conn, id, delete_from_disk).map_err(|e| e.to_string())
}

// --------------------------------------------------------------------------
// Favorites & Star Ratings Commands
// --------------------------------------------------------------------------

#[tauri::command]
pub fn set_media_favorite(
    state: State<'_, AppState>,
    id: i64,
    is_favorite: bool,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::set_media_favorite(&conn, id, is_favorite).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_media_rating(
    state: State<'_, AppState>,
    id: i64,
    rating: u32,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::set_media_rating(&conn, id, rating).map_err(|e| e.to_string())
}

// --------------------------------------------------------------------------
// Albums & Collections Commands
// --------------------------------------------------------------------------

#[tauri::command]
pub fn create_album(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
) -> Result<Album, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::create_album(&conn, &name, description.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_albums(
    state: State<'_, AppState>,
) -> Result<Vec<Album>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::get_albums(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_album(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::delete_album(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_media_to_album(
    state: State<'_, AppState>,
    album_id: i64,
    media_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::add_media_to_album(&conn, album_id, &media_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_media_from_album(
    state: State<'_, AppState>,
    album_id: i64,
    media_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::remove_media_from_album(&conn, album_id, &media_ids).map_err(|e| e.to_string())
}

// --------------------------------------------------------------------------
// Tags Commands
// --------------------------------------------------------------------------

#[tauri::command]
pub fn create_tag(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::create_tag(&conn, &name, color.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tags(
    state: State<'_, AppState>,
) -> Result<Vec<Tag>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::get_tags(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_tag(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::delete_tag(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_tag_to_media(
    state: State<'_, AppState>,
    media_id: i64,
    tag_id: i64,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::add_tag_to_media(&conn, media_id, tag_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_tag_from_media(
    state: State<'_, AppState>,
    media_id: i64,
    tag_id: i64,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::remove_tag_from_media(&conn, media_id, tag_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_media_tags(
    state: State<'_, AppState>,
    media_id: i64,
) -> Result<Vec<Tag>, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::get_media_tags(&conn, media_id).map_err(|e| e.to_string())
}

// --------------------------------------------------------------------------
// High-Performance Batch Operations Commands
// --------------------------------------------------------------------------

#[tauri::command]
pub fn batch_set_media_favorite(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    is_favorite: bool,
) -> Result<(), String> {
    let mut conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::batch_set_media_favorite(&mut conn, &ids, is_favorite).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn batch_delete_media(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    delete_from_disk: bool,
) -> Result<Vec<String>, String> {
    let mut conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::batch_delete_media(&mut conn, &ids, delete_from_disk).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn batch_add_tag_to_media(
    state: State<'_, AppState>,
    media_ids: Vec<i64>,
    tag_id: i64,
) -> Result<(), String> {
    let mut conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::batch_add_tag_to_media(&mut conn, &media_ids, tag_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn batch_add_media_to_album(
    state: State<'_, AppState>,
    album_id: i64,
    media_ids: Vec<i64>,
) -> Result<(), String> {
    let mut conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::batch_add_media_to_album(&mut conn, album_id, &media_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_library_stats(
    state: State<'_, AppState>,
) -> Result<LibraryStats, String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::get_library_stats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_media_orientation(
    state: State<'_, AppState>,
    id: i64,
    orientation: u32,
) -> Result<(), String> {
    let conn = DatabaseManager::open(&state.db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    MediaRepository::set_media_orientation(&conn, id, orientation).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_media_files(
    source_paths: Vec<String>,
    destination_folder: String,
) -> Result<u32, String> {
    use std::path::Path;
    let dest = Path::new(&destination_folder);
    if !dest.exists() {
        std::fs::create_dir_all(dest).map_err(|e| format!("Failed to create destination folder: {}", e))?;
    }

    let mut copied = 0u32;
    for path_str in source_paths {
        let src = Path::new(&path_str);
        if src.exists() && src.is_file() {
            if let Some(target) = resolve_collision_safe_path(dest, src) {
                if std::fs::copy(src, target).is_ok() {
                    copied += 1;
                }
            }
        }
    }
    Ok(copied)
}

pub fn resolve_collision_safe_path(dest: &std::path::Path, src: &std::path::Path) -> Option<std::path::PathBuf> {
    let file_name = src.file_name()?.to_str()?;
    let stem = src.file_stem()?.to_str()?;
    let ext = src.extension().and_then(|e| e.to_str());

    let mut target = dest.join(file_name);
    let mut counter = 1;

    while target.exists() {
        let new_name = match ext {
            Some(e) => format!("{}_{}.{}", stem, counter, e),
            None => format!("{}_{}", stem, counter),
        };
        target = dest.join(new_name);
        counter += 1;
    }

    Some(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn test_resolve_collision_safe_path() {
        let root = std::env::temp_dir().join(format!("test_export_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let src_dir = root.join("src");
        let dest_dir = root.join("dest");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&dest_dir).unwrap();

        let src_file = src_dir.join("photo.jpg");
        File::create(&src_file).unwrap();

        // 1. Initial path should be photo.jpg when destination is empty
        let first_target = resolve_collision_safe_path(&dest_dir, &src_file).unwrap();
        assert_eq!(first_target.file_name().unwrap(), "photo.jpg");

        // 2. If photo.jpg exists in destination, next should be photo_1.jpg
        File::create(&dest_dir.join("photo.jpg")).unwrap();
        let second_target = resolve_collision_safe_path(&dest_dir, &src_file).unwrap();
        assert_eq!(second_target.file_name().unwrap(), "photo_1.jpg");

        // 3. If photo_1.jpg also exists in destination, next should be photo_2.jpg
        File::create(&dest_dir.join("photo_1.jpg")).unwrap();
        let third_target = resolve_collision_safe_path(&dest_dir, &src_file).unwrap();
        assert_eq!(third_target.file_name().unwrap(), "photo_2.jpg");

        let _ = std::fs::remove_dir_all(&root);
    }
}




