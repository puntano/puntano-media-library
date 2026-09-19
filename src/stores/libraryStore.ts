import { create } from 'zustand';
import { IndexingProgressEvent, MediaItem } from '../types/media';

interface LibraryState {
  activeView: 'map' | 'timeline' | 'gallery';
  totalMediaCount: number;
  isIndexing: boolean;
  indexingProgress: IndexingProgressEvent | null;
  selectedItem: MediaItem | null;
  isInspectorOpen: boolean;
  mediaTypeFilter: 'all' | 'photo' | 'video';

  // Search & Filter State
  searchQuery: string;
  hasGpsOnly: boolean;
  dateFrom: number | null;
  dateTo: number | null;

  setActiveView: (view: 'map' | 'timeline' | 'gallery') => void;
  setTotalMediaCount: (count: number) => void;
  setIsIndexing: (isIndexing: boolean) => void;
  setIndexingProgress: (progress: IndexingProgressEvent | null) => void;
  setSelectedItem: (item: MediaItem | null) => void;
  setInspectorOpen: (open: boolean) => void;
  setMediaTypeFilter: (filter: 'all' | 'photo' | 'video') => void;

  setSearchQuery: (query: string) => void;
  setHasGpsOnly: (hasGps: boolean) => void;
  setDateRange: (from: number | null, to: number | null) => void;
  clearFilters: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  activeView: 'map',
  totalMediaCount: 0,
  isIndexing: false,
  indexingProgress: null,
  selectedItem: null,
  isInspectorOpen: false,
  mediaTypeFilter: 'all',

  searchQuery: '',
  hasGpsOnly: false,
  dateFrom: null,
  dateTo: null,

  setActiveView: (view) => set({ activeView: view }),
  setTotalMediaCount: (count) => set({ totalMediaCount: count }),
  setIsIndexing: (isIndexing) => set({ isIndexing }),
  setIndexingProgress: (indexingProgress) => set({ indexingProgress }),
  setSelectedItem: (selectedItem) => set({ selectedItem, isInspectorOpen: selectedItem !== null }),
  setInspectorOpen: (isInspectorOpen) => set({ isInspectorOpen }),
  setMediaTypeFilter: (mediaTypeFilter) => set({ mediaTypeFilter }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setHasGpsOnly: (hasGpsOnly) => set({ hasGpsOnly }),
  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo }),
  clearFilters: () =>
    set({
      searchQuery: '',
      hasGpsOnly: false,
      dateFrom: null,
      dateTo: null,
      mediaTypeFilter: 'all',
    }),
}));
