import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { MediaItem, SpatialClusterPoint, TimelineGroup, IndexingProgressEvent } from '../types/media';

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

  onIndexingProgress(callback: (event: IndexingProgressEvent) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<IndexingProgressEvent>('indexing-progress', (event) => {
      callback(event.payload);
    });
  },
};
