export interface MediaItem {
  id: number;
  library_id: number;
  file_path: string;
  directory: string;
  file_name: string;
  file_size: number;
  file_modified_at: number;
  file_hash: string;
  mime_type: string;
  media_type: 'photo' | 'video' | 'raw';

  width?: number;
  height?: number;
  duration?: number;
  orientation: number;

  captured_at?: number;
  captured_at_local?: string;
  timezone_offset?: number;

  latitude?: number;
  longitude?: number;
  altitude?: number;
  geohash?: string;

  camera_make?: string;
  camera_model?: string;
  lens_model?: string;
  focal_length?: number;
  aperture?: number;
  iso?: number;
  exposure_time?: string;

  thumbnail_path?: string;
  thumbnail_status: 'pending' | 'ready' | 'failed' | 'skipped';

  // User Curation
  is_favorite: boolean;
  rating: number; // 0 to 5

  indexed_at: number;
  updated_at: number;
}

export interface DuplicateGroup {
  file_hash: string;
  count: number;
  total_size_bytes: number;
  items: MediaItem[];
}

export interface Album {
  id: number;
  name: string;
  description?: string;
  cover_media_id?: number;
  cover_file_path?: string;
  cover_file_hash?: string;
  media_count: number;
  created_at: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  media_count: number;
}

export interface SpatialClusterPoint {
  id: number;
  latitude: number;
  longitude: number;
  file_path: string;
  file_hash: string;
  captured_at?: number;
  thumbnail_path?: string;
  media_type: 'photo' | 'video' | 'raw';
  is_favorite?: boolean;
  rating?: number;
}

export interface MapFocusTarget {
  id: number;
  latitude: number;
  longitude: number;
  file_path: string;
  file_hash: string;
  media_type: 'photo' | 'video' | 'raw';
  captured_at?: number;
  is_favorite?: boolean;
  rating?: number;
}

export interface TimelineGroup {
  period: string; // e.g. "2026-09"
  count: number;
  cover_id?: number;
  cover_file_path?: string;
  cover_file_hash?: string;
}

export interface IndexingProgressEvent {
  stage: 'discovering' | 'indexing' | 'completed';
  scanned_files: number;
  indexed_files: number;
  current_directory: string;
  is_complete: boolean;
  elapsed_ms: number;
}

export interface MediaFilterQuery {
  query_text?: string;
  date_from?: number;
  date_to?: number;
  media_type?: 'all' | 'photo' | 'video' | 'raw';
  camera_make?: string;
  has_gps_only?: boolean;
  is_favorite_only?: boolean;
  min_rating?: number;
  album_id?: number;
  tag_id?: number;
  sort_by?: 'date' | 'name' | 'size' | 'rating';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface LibraryInfo {
  id: number;
  path: string;
  is_active: boolean;
  last_scanned_at?: number;
  total_files: number;
  created_at: number;
}

export interface LibraryStats {
  total_files: number;
  total_photos: number;
  total_videos: number;
  total_size_bytes: number;
  total_geotagged: number;
  total_favorites: number;
  total_albums: number;
  total_tags: number;
}

export interface DiagnosticReport {
  app_version: string;
  os_name: string;
  os_family: string;
  arch: string;
  cpu_threads: number;
  ffmpeg_available: boolean;
  db_path: string;
  db_size_bytes: number;
  db_free_space_bytes?: number | null;
  cache_dir_path: string;
  log_file_path: string;
  total_libraries: number;
  registered_libraries: string[];
  total_media_files: number;
  photos_count: number;
  raw_count: number;
  videos_count: number;
  duplicate_extra_files: number;
  thumbnails_ready: number;
  thumbnails_pending: number;
  thumbnails_failed: number;
  top_extensions: string[];
  critical_alerts: string[];
  recent_logs: string[];
}

