import { create } from 'zustand';
import { IndexingProgressEvent, MediaItem } from '../types/media';

interface LibraryState {
  activeView: 'map' | 'timeline' | 'gallery';
  totalMediaCount: number;
  isIndexing: boolean;
  indexingProgress: IndexingProgressEvent | null;
  selectedItem: MediaItem | null;
  mediaTypeFilter: 'all' | 'photo' | 'video';

  setActiveView: (view: 'map' | 'timeline' | 'gallery') => void;
  setTotalMediaCount: (count: number) => void;
  setIsIndexing: (isIndexing: boolean) => void;
  setIndexingProgress: (progress: IndexingProgressEvent | null) => void;
  setSelectedItem: (item: MediaItem | null) => void;
  setMediaTypeFilter: (filter: 'all' | 'photo' | 'video') => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  activeView: 'map',
  totalMediaCount: 0,
  isIndexing: false,
  indexingProgress: null,
  selectedItem: null,
  mediaTypeFilter: 'all',

  setActiveView: (view) => set({ activeView: view }),
  setTotalMediaCount: (count) => set({ totalMediaCount: count }),
  setIsIndexing: (isIndexing) => set({ isIndexing }),
  setIndexingProgress: (indexingProgress) => set({ indexingProgress }),
  setSelectedItem: (selectedItem) => set({ selectedItem }),
  setMediaTypeFilter: (mediaTypeFilter) => set({ mediaTypeFilter }),
}));
