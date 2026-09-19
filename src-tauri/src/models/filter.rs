use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MediaFilterQuery {
    pub query_text: Option<String>,
    pub date_from: Option<i64>,      // Epoch ms
    pub date_to: Option<i64>,        // Epoch ms
    pub media_type: Option<String>,  // "all" | "photo" | "video" | "raw"
    pub camera_make: Option<String>,
    pub has_gps_only: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}
