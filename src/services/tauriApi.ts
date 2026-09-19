import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { MediaItem, SpatialClusterPoint, TimelineGroup, IndexingProgressEvent, LibraryInfo } from '../types/media';

// Check if running inside native Tauri runtime
export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const tauriApi = {
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
    limit: number = 10000
  ): Promise<SpatialClusterPoint[]> {
    if (!isTauri()) {
      // Mock spatial data for browser development
      return [
        { id: 1, latitude: 37.7749, longitude: -122.4194, file_path: '/photos/sf.jpg', media_type: 'photo' },
        { id: 2, latitude: 37.7833, longitude: -122.4167, file_path: '/photos/bay.jpg', media_type: 'photo' },
        { id: 3, latitude: 34.0522, longitude: -118.2437, file_path: '/photos/la.mov', media_type: 'video' },
        { id: 4, latitude: 40.7128, longitude: -74.0060, file_path: '/photos/nyc.jpg', media_type: 'photo' },
        { id: 5, latitude: 51.5074, longitude: -0.1278, file_path: '/photos/london.jpg', media_type: 'photo' },
      ];
    }
    return await invoke<SpatialClusterPoint[]>('query_spatial_bounding_box', {
      minLat,
      maxLat,
      minLon,
      maxLon,
      limit,
    });
  },

  async queryTimelineGroups(): Promise<TimelineGroup[]> {
    if (!isTauri()) {
      return [
        { period: '2026-09', count: 482 },
        { period: '2026-08', count: 1250 },
        { period: '2026-07', count: 914 },
        { period: '2026-06', count: 1530 },
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

  onIndexingProgress(callback: (event: IndexingProgressEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<IndexingProgressEvent>('indexing-progress', (event) => {
      callback(event.payload);
    });
  },
};
