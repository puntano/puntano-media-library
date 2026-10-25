import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  MediaItem,
  SpatialClusterPoint,
  TimelineGroup,
  IndexingProgressEvent,
  LibraryInfo,
  DuplicateGroup,
  Album,
  Tag,
  LibraryStats,
  DiagnosticReport,
} from '../types/media';

// Check if running inside native Tauri runtime
export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let frontendLogWindowStart = Date.now();
let frontendLogCount = 0;

export const tauriApi = {
  logFrontendEvent(level: 'warn' | 'error' | 'fatal', source: string, message: string): void {
    const now = Date.now();
    if (now - frontendLogWindowStart > 60_000) {
      frontendLogWindowStart = now;
      frontendLogCount = 0;
    }
    if (frontendLogCount >= 30) return;
    frontendLogCount += 1;

    if (!isTauri()) return;
    invoke('log_frontend_event', { level, source, message }).catch(() => {});
  },
  async startIndexing(folderPath: string): Promise<number> {
    if (!isTauri()) {
      console.warn('[Mock] startIndexing:', folderPath);
      return 42;
    }
    return await invoke<number>('start_indexing', { folderPath });
  },

  async cancelIndexing(): Promise<void> {
    if (!isTauri()) return;
    await invoke('cancel_indexing');
  },

  async getTotalMediaCount(): Promise<number> {
    if (!isTauri()) return 12480;
    return await invoke<number>('get_total_media_count');
  },

  async getLibraries(): Promise<LibraryInfo[]> {
    if (!isTauri()) {
      return [
        {
          id: 1,
          path: 'C:\\Users\\User\\Pictures\\Photos_2026',
          is_active: true,
          last_scanned_at: Date.now() - 3600000,
          total_files: 8420,
          created_at: Date.now() - 86400000 * 30,
        },
        {
          id: 2,
          path: 'D:\\Archive\\Vacation_Videos',
          is_active: true,
          last_scanned_at: Date.now() - 7200000,
          total_files: 4060,
          created_at: Date.now() - 86400000 * 15,
        },
      ];
    }
    return await invoke<LibraryInfo[]>('get_libraries');
  },

  async removeLibrary(libraryId: number): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] removeLibrary:', libraryId);
      return;
    }
    await invoke('remove_library', { libraryId });
  },

  async pruneMissingFiles(): Promise<number> {
    if (!isTauri()) {
      console.warn('[Mock] pruneMissingFiles');
      return 0;
    }
    return await invoke<number>('prune_missing_files');
  },

  async showInFolder(path: string): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] showInFolder:', path);
      return;
    }
    await invoke('show_in_folder', { path });
  },

  async querySpatialBoundingBox(
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number,
    limit: number = 10000,
    albumId?: number | null,
    tagId?: number | null
  ): Promise<SpatialClusterPoint[]> {
    if (!isTauri()) {
      // Mock spatial data for browser development
      return [
        { id: 1, latitude: 37.7749, longitude: -122.4194, file_path: '/photos/sf.jpg', file_hash: 'mock_sf', media_type: 'photo', is_favorite: true, rating: 5 },
        { id: 2, latitude: 37.7833, longitude: -122.4167, file_path: '/photos/bay.jpg', file_hash: 'mock_bay', media_type: 'photo', is_favorite: false, rating: 4 },
        { id: 3, latitude: 34.0522, longitude: -118.2437, file_path: '/photos/la.mov', file_hash: 'mock_la', media_type: 'video', is_favorite: false, rating: 0 },
        { id: 4, latitude: 40.7128, longitude: -74.0060, file_path: '/photos/nyc.jpg', file_hash: 'mock_nyc', media_type: 'photo', is_favorite: true, rating: 3 },
        { id: 5, latitude: 51.5074, longitude: -0.1278, file_path: '/photos/london.jpg', file_hash: 'mock_london', media_type: 'photo', is_favorite: false, rating: 0 },
      ];
    }
    return await invoke<SpatialClusterPoint[]>('query_spatial_bounding_box', {
      minLat,
      maxLat,
      minLon,
      maxLon,
      limit,
      albumId: albumId ?? null,
      tagId: tagId ?? null,
    });
  },

  async queryTimelineGroups(): Promise<TimelineGroup[]> {
    if (!isTauri()) {
      return [
        { period: '2026-09', count: 482, cover_file_path: '/photos/sf.jpg', cover_file_hash: 'mock_sf' },
        { period: '2026-08', count: 1250, cover_file_path: '/photos/bay.jpg', cover_file_hash: 'mock_bay' },
        { period: '2026-07', count: 914, cover_file_path: '/photos/la.mov', cover_file_hash: 'mock_la' },
        { period: '2026-06', count: 1530, cover_file_path: '/photos/nyc.jpg', cover_file_hash: 'mock_nyc' },
      ];
    }
    return await invoke<TimelineGroup[]>('query_timeline_groups');
  },

  async queryMediaPaged(limit: number, offset: number): Promise<MediaItem[]> {
    if (!isTauri()) {
      return Array.from({ length: limit }).map((_, i) => ({
        id: offset + i + 1,
        library_id: 1,
        file_path: `/mock/media/IMG_${offset + i + 1}.JPG`,
        directory: '/mock/media',
        file_name: `IMG_${offset + i + 1}.JPG`,
        file_size: 4500000,
        file_modified_at: Date.now() - (offset + i) * 86400000,
        file_hash: `hash_${offset + i + 1}`,
        mime_type: 'image/jpeg',
        media_type: 'photo',
        orientation: 1,
        captured_at: Date.now() - (offset + i) * 86400000,
        is_favorite: false,
        rating: 0,
        thumbnail_status: 'ready',
        indexed_at: Date.now(),
        updated_at: Date.now(),
      }));
    }
    return await invoke<MediaItem[]>('query_media_paged', { limit, offset });
  },

  async searchMedia(query: import('../types/media').MediaFilterQuery): Promise<MediaItem[]> {
    if (!isTauri()) {
      const limit = query.limit || 50;
      return Array.from({ length: limit }).map((_, i) => ({
        id: i + 1,
        library_id: 1,
        file_path: `/mock/search/MATCH_${query.query_text || 'ITEM'}_${i + 1}.JPG`,
        directory: '/mock/search',
        file_name: `MATCH_${query.query_text || 'ITEM'}_${i + 1}.JPG`,
        file_size: 3800000,
        file_modified_at: Date.now() - i * 86400000,
        file_hash: `search_hash_${i + 1}`,
        mime_type: query.media_type === 'video' ? 'video/mp4' : 'image/jpeg',
        media_type: (query.media_type === 'video' ? 'video' : 'photo') as any,
        orientation: 1,
        captured_at: Date.now() - i * 86400000,
        is_favorite: query.is_favorite_only || false,
        rating: query.min_rating || 0,
        thumbnail_status: 'ready',
        camera_make: query.camera_make || 'Sony',
        camera_model: 'A7 IV',
        indexed_at: Date.now(),
        updated_at: Date.now(),
      }));
    }
    return await invoke<MediaItem[]>('search_media', { query });
  },

  async getMediaItem(id: number): Promise<MediaItem | null> {
    if (!isTauri()) {
      return {
        id,
        library_id: 1,
        file_path: `/mock/media/ITEM_${id}.JPG`,
        directory: '/mock/media',
        file_name: `ITEM_${id}.JPG`,
        file_size: 5200000,
        file_modified_at: Date.now() - 86400000,
        file_hash: `hash_${id}`,
        mime_type: 'image/jpeg',
        media_type: 'photo',
        orientation: 1,
        captured_at: Date.now() - 86400000,
        thumbnail_status: 'ready',
        is_favorite: false,
        rating: 0,
        camera_make: 'Sony',
        camera_model: 'ILCE-7M4',
        lens_model: 'FE 24-70mm F2.8 GM II',
        focal_length: 35.0,
        aperture: 2.8,
        iso: 100,
        exposure_time: '1/250s',
        indexed_at: Date.now(),
        updated_at: Date.now(),
      };
    }
    return await invoke<MediaItem | null>('get_media_item', { id });
  },

  // Duplicates Management
  async queryDuplicateGroups(): Promise<DuplicateGroup[]> {
    if (!isTauri()) {
      return [
        {
          file_hash: 'mock_dupe_hash_1',
          count: 2,
          total_size_bytes: 8400000,
          items: [
            {
              id: 101,
              library_id: 1,
              file_path: 'C:\\Users\\User\\Pictures\\Camera\\DSC001.JPG',
              directory: 'C:\\Users\\User\\Pictures\\Camera',
              file_name: 'DSC001.JPG',
              file_size: 4200000,
              file_modified_at: Date.now() - 5000000,
              file_hash: 'mock_dupe_hash_1',
              mime_type: 'image/jpeg',
              media_type: 'photo',
              orientation: 1,
              captured_at: Date.now() - 5000000,
              thumbnail_status: 'ready',
              is_favorite: false,
              rating: 0,
              indexed_at: Date.now(),
              updated_at: Date.now(),
            },
            {
              id: 102,
              library_id: 1,
              file_path: 'D:\\Backup\\Exports\\DSC001_copy.JPG',
              directory: 'D:\\Backup\\Exports',
              file_name: 'DSC001_copy.JPG',
              file_size: 4200000,
              file_modified_at: Date.now() - 5000000,
              file_hash: 'mock_dupe_hash_1',
              mime_type: 'image/jpeg',
              media_type: 'photo',
              orientation: 1,
              captured_at: Date.now() - 5000000,
              thumbnail_status: 'ready',
              is_favorite: false,
              rating: 0,
              indexed_at: Date.now(),
              updated_at: Date.now(),
            },
          ],
        },
      ];
    }
    return await invoke<DuplicateGroup[]>('query_duplicate_groups');
  },

  async deleteMediaFile(id: number, deleteFromDisk: boolean = false): Promise<string | null> {
    if (!isTauri()) {
      console.warn('[Mock] deleteMediaFile:', id, deleteFromDisk);
      return '/mock/deleted/file.jpg';
    }
    return await invoke<string | null>('delete_media_file', { id, deleteFromDisk });
  },

  // Curation: Favorites & Ratings
  async setMediaFavorite(id: number, isFavorite: boolean): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] setMediaFavorite:', id, isFavorite);
      return;
    }
    await invoke('set_media_favorite', { id, isFavorite });
  },

  async setMediaRating(id: number, rating: number): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] setMediaRating:', id, rating);
      return;
    }
    await invoke('set_media_rating', { id, rating });
  },

  // Albums & Collections
  async createAlbum(name: string, description?: string): Promise<Album> {
    if (!isTauri()) {
      return {
        id: Date.now(),
        name,
        description,
        media_count: 0,
        created_at: Date.now(),
      };
    }
    return await invoke<Album>('create_album', { name, description });
  },

  async getAlbums(): Promise<Album[]> {
    if (!isTauri()) {
      return [
        {
          id: 1,
          name: 'Summer Trip 2026',
          description: 'Highlights from the coast',
          cover_file_path: '/photos/sf.jpg',
          cover_file_hash: 'mock_sf',
          media_count: 24,
          created_at: Date.now() - 86400000 * 5,
        },
        {
          id: 2,
          name: 'Architecture & Cityscapes',
          description: 'Urban photography portfolio',
          cover_file_path: '/photos/nyc.jpg',
          cover_file_hash: 'mock_nyc',
          media_count: 58,
          created_at: Date.now() - 86400000 * 12,
        },
      ];
    }
    return await invoke<Album[]>('get_albums');
  },

  async deleteAlbum(id: number): Promise<void> {
    if (!isTauri()) return;
    await invoke('delete_album', { id });
  },

  async updateAlbum(
    id: number,
    name: string,
    description?: string | null,
    coverMediaId?: number | null
  ): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] updateAlbum:', id, name, description, coverMediaId);
      return;
    }
    await invoke('update_album', {
      id,
      name,
      description: description ?? null,
      coverMediaId: coverMediaId ?? null,
    });
  },

  async getMediaAlbums(mediaId: number): Promise<Album[]> {
    if (!isTauri()) {
      return [
        {
          id: 1,
          name: 'Summer Trip 2026',
          description: 'Highlights from the coast',
          media_count: 24,
          created_at: Date.now() - 86400000 * 5,
        },
      ];
    }
    return await invoke<Album[]>('get_media_albums', { mediaId });
  },

  async addMediaToAlbum(albumId: number, mediaIds: number[]): Promise<void> {
    if (!isTauri()) return;
    await invoke('add_media_to_album', { albumId, mediaIds });
  },

  async removeMediaFromAlbum(albumId: number, mediaIds: number[]): Promise<void> {
    if (!isTauri()) return;
    await invoke('remove_media_from_album', { albumId, mediaIds });
  },

  // Tags
  async createTag(name: string, color?: string): Promise<Tag> {
    if (!isTauri()) {
      return { id: Date.now(), name, color: color || '#3b82f6', media_count: 0 };
    }
    return await invoke<Tag>('create_tag', { name, color });
  },

  async getTags(): Promise<Tag[]> {
    if (!isTauri()) {
      return [
        { id: 1, name: 'Landscape', color: '#10b981', media_count: 142 },
        { id: 2, name: 'Portrait', color: '#f59e0b', media_count: 85 },
        { id: 3, name: 'Travel', color: '#6366f1', media_count: 310 },
      ];
    }
    return await invoke<Tag[]>('get_tags');
  },

  async deleteTag(id: number): Promise<void> {
    if (!isTauri()) return;
    await invoke('delete_tag', { id });
  },

  async addTagToMedia(mediaId: number, tagId: number): Promise<void> {
    if (!isTauri()) return;
    await invoke('add_tag_to_media', { mediaId, tagId });
  },

  async removeTagFromMedia(mediaId: number, tagId: number): Promise<void> {
    if (!isTauri()) return;
    await invoke('remove_tag_from_media', { mediaId, tagId });
  },

  async getMediaTags(mediaId: number): Promise<Tag[]> {
    if (!isTauri()) {
      return [{ id: 1, name: 'Landscape', color: '#10b981', media_count: 1 }];
    }
    return await invoke<Tag[]>('get_media_tags', { mediaId });
  },

  // Batch Operations
  async batchSetMediaFavorite(ids: number[], isFavorite: boolean): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] batchSetMediaFavorite:', ids.length, isFavorite);
      return;
    }
    await invoke('batch_set_media_favorite', { ids, isFavorite });
  },

  async batchDeleteMedia(ids: number[], deleteFromDisk: boolean = false): Promise<string[]> {
    if (!isTauri()) {
      console.warn('[Mock] batchDeleteMedia:', ids.length, deleteFromDisk);
      return ids.map((id) => `/mock/deleted/${id}.jpg`);
    }
    return await invoke<string[]>('batch_delete_media', { ids, deleteFromDisk });
  },

  async batchAddTagToMedia(mediaIds: number[], tagId: number): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] batchAddTagToMedia:', mediaIds.length, tagId);
      return;
    }
    await invoke('batch_add_tag_to_media', { mediaIds, tagId });
  },

  async batchAddMediaToAlbum(albumId: number, mediaIds: number[]): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] batchAddMediaToAlbum:', albumId, mediaIds.length);
      return;
    }
    await invoke('batch_add_media_to_album', { albumId, mediaIds });
  },

  async getLibraryStats(): Promise<LibraryStats> {
    if (!isTauri()) {
      return {
        total_files: 12480,
        total_photos: 10240,
        total_videos: 2240,
        total_size_bytes: 42 * 1024 * 1024 * 1024,
        total_geotagged: 8960,
        total_favorites: 420,
        total_albums: 12,
        total_tags: 18,
      };
    }
    return await invoke<LibraryStats>('get_library_stats');
  },

  async setMediaOrientation(id: number, orientation: number): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] setMediaOrientation:', id, orientation);
      return;
    }
    await invoke('set_media_orientation', { id, orientation });
  },

  async resolveLocationName(latitude: number, longitude: number): Promise<string | null> {
    if (!isTauri()) {
      if (Math.abs(latitude - 37.7749) < 1 && Math.abs(longitude - -122.4194) < 1) {
        return 'San Francisco, United States';
      }
      if (Math.abs(latitude - 35.6762) < 1 && Math.abs(longitude - 139.6503) < 1) {
        return 'Tokyo, Japan';
      }
      return null;
    }
    return await invoke<string | null>('resolve_location_name', { latitude, longitude });
  },

  async exportMediaFiles(sourcePaths: string[], destinationFolder: string): Promise<number> {
    if (!isTauri()) {
      console.warn('[Mock] exportMediaFiles to:', destinationFolder, sourcePaths.length);
      return sourcePaths.length;
    }
    return await invoke<number>('export_media_files', { sourcePaths, destinationFolder });
  },

  async getLogs(maxLines?: number): Promise<string[]> {
    if (!isTauri()) {
      return [
        '2026-10-13 11:30:00 [INFO ] [puntano_engine] Application running in web browser mock mode',
        '2026-10-13 11:30:01 [INFO ] [db::connection] In-memory SQLite initialized',
      ];
    }
    return await invoke<string[]>('get_logs', { maxLines });
  },

  async getLogFilePath(): Promise<string> {
    if (!isTauri()) {
      return '/mock/app_data/logs/puntano.log';
    }
    return await invoke<string>('get_log_file_path');
  },

  async openLogFolder(): Promise<void> {
    if (!isTauri()) {
      console.warn('[Mock] openLogFolder called');
      return;
    }
    await invoke('open_log_folder');
  },

  async exportLogs(destinationPath: string): Promise<string> {
    if (!isTauri()) {
      console.warn('[Mock] exportLogs to:', destinationPath);
      return destinationPath;
    }
    return await invoke<string>('export_logs', { destinationPath });
  },

  async getDiagnosticReport(): Promise<DiagnosticReport> {
    if (!isTauri()) {
      return {
        app_version: '0.4.1',
        os_name: 'windows',
        os_family: 'windows',
        arch: 'x86_64',
        cpu_threads: 16,
        ffmpeg_available: false,
        db_path: 'C:\\Users\\Mock\\AppData\\Roaming\\puntano\\puntano.db',
        db_size_bytes: 48500000,
        db_free_space_bytes: 128 * 1024 * 1024 * 1024,
        cache_dir_path: 'C:\\Users\\Mock\\AppData\\Local\\puntano\\cache',
        log_file_path: 'C:\\Users\\Mock\\AppData\\Roaming\\puntano\\logs\\puntano.log',
        total_libraries: 2,
        registered_libraries: [
          '[#1] C:\\Users\\User\\Pictures\\Photos_2026 (8420 files, active)',
          '[#2] D:\\Archive\\Vacation_Videos (4060 files, active)',
        ],
        total_media_files: 12480,
        photos_count: 10120,
        raw_count: 120,
        videos_count: 2240,
        duplicate_extra_files: 34,
        thumbnails_ready: 12450,
        thumbnails_pending: 30,
        thumbnails_failed: 0,
        top_extensions: ['.jpg (8420)', '.mp4 (2240)', '.heic (1700)', '.dng (120)'],
        critical_alerts: [],
        recent_logs: [
          '2026-10-13 11:30:00 [INFO ] [lib] SQLite initialized with R*Tree support',
          '2026-10-13 11:30:01 [INFO ] [indexer] Discovery complete: 12,480 files found',
        ],
      };
    }
    return await invoke<DiagnosticReport>('get_diagnostic_report');
  },



  onIndexingProgress(callback: (event: IndexingProgressEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<IndexingProgressEvent>('indexing-progress', (event) => {
      callback(event.payload);
    });
  },

  onLibraryIncrementalSync(callback: (path: string) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<string>('library-incremental-sync', (event) => {
      callback(event.payload);
    });
  },

  onThumbnailsReady(callback: (readyCount: number) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<number>('thumbnails-ready', (event) => {
      callback(event.payload);
    });
  },
};
