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

  indexed_at: number;
  updated_at: number;
}

export interface SpatialClusterPoint {
  id: number;
  latitude: number;
  longitude: number;
  file_path: string;
  captured_at?: number;
  thumbnail_path?: string;
  media_type: 'photo' | 'video' | 'raw';
}

export interface TimelineGroup {
  period: string; // e.g. "2026-09"
  count: number;
  cover_id?: number;
  cover_file_path?: string;
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
  limit?: number;
  offset?: number;
}
