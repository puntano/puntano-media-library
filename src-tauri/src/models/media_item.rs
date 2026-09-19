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
    pub thumbnail_status: String, // "pending" | "ready" | "failed" | "skipped"

    pub indexed_at: i64,
    pub updated_at: i64,
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
    pub captured_at: Option<i64>,
    pub thumbnail_path: Option<String>,
    pub media_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineGroup {
    pub period: String, // "2026-09" or "2026-09-19"
    pub count: i64,
    pub cover_id: Option<i64>,
    pub cover_file_path: Option<String>,
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
