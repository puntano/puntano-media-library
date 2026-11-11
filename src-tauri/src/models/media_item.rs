use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: Option<i64>,
    pub library_id: i64,
    pub file_path: String,
    pub directory: String,
    pub file_name: String,
    pub file_size: i64,
    pub file_modified_at: i64,
    pub file_hash: String,
    pub mime_type: String,
    pub media_type: String, // "photo" | "video" | "raw"

    // Dimensions & Video
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub orientation: u32,

    // Chronological metadata
    pub captured_at: Option<i64>, // Epoch ms
    pub captured_at_local: Option<String>,
    pub timezone_offset: Option<i32>,

    // Geolocation metadata (WGS84)
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
    pub geohash: Option<String>,

    // EXIF details
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub iso: Option<u32>,
    pub exposure_time: Option<String>,

    // Thumbnail cache
    pub thumbnail_path: Option<String>,
    pub thumbnail_status: String,

    // User curation
    pub is_favorite: bool,
    pub rating: u32,

    pub indexed_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub file_hash: String,
    pub count: i64,
    pub total_size_bytes: i64,
    pub items: Vec<MediaItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryGroup {
    pub year: i32,
    pub years_ago: i32,
    pub count: i64,
    pub cover_item: MediaItem,
    pub items: Vec<MediaItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub cover_media_id: Option<i64>,
    pub cover_file_path: Option<String>,
    pub cover_file_hash: Option<String>,
    pub media_count: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub media_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialBoundingBox {
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lon: f64,
    pub max_lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialClusterPoint {
    pub id: i64,
    pub latitude: f64,
    pub longitude: f64,
    pub file_path: String,
    pub file_hash: String,
    pub captured_at: Option<i64>,
    pub thumbnail_path: Option<String>,
    pub media_type: String,
    pub is_favorite: bool,
    pub rating: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineGroup {
    pub period: String, // "2026-09" or "2026-09-19"
    pub count: i64,
    pub cover_id: Option<i64>,
    pub cover_file_path: Option<String>,
    pub cover_file_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexingProgressEvent {
    pub stage: String,
    pub scanned_files: u64,
    pub indexed_files: u64,
    pub current_directory: String,
    pub is_complete: bool,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryInfo {
    pub id: i64,
    pub path: String,
    pub is_active: bool,
    pub last_scanned_at: Option<i64>,
    pub total_files: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryStats {
    pub total_files: i64,
    pub total_photos: i64,
    pub total_videos: i64,
    pub total_size_bytes: i64,
    pub total_geotagged: i64,
    pub total_favorites: i64,
    pub total_albums: i64,
    pub total_tags: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Person {
    pub id: i64,
    pub name: Option<String>,
    pub cover_face_id: Option<i64>,
    pub cover_media_id: Option<i64>,
    pub cover_media_hash: Option<String>,
    pub cover_bbox_x: Option<f32>,
    pub cover_bbox_y: Option<f32>,
    pub cover_bbox_w: Option<f32>,
    pub cover_bbox_h: Option<f32>,
    pub face_count: usize,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaFace {
    pub id: i64,
    pub media_id: i64,
    pub person_id: Option<i64>,
    pub person_name: Option<String>,
    pub bbox_x: f32,
    pub bbox_y: f32,
    pub bbox_w: f32,
    pub bbox_h: f32,
    pub confidence: f32,
}

