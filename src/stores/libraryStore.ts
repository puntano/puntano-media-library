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

  // Fullscreen Lightbox State
  lightboxIndex: number | null;
  lightboxItems: MediaItem[];

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

  openLightbox: (items: MediaItem[], index: number) => void;
  closeLightbox: () => void;
  nextLightboxItem: () => void;
  prevLightboxItem: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
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

  lightboxIndex: null,
  lightboxItems: [],

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

  openLightbox: (items, index) =>
    set({
      lightboxItems: items,
      lightboxIndex: Math.max(0, Math.min(index, items.length - 1)),
    }),

  closeLightbox: () => set({ lightboxIndex: null }),

  nextLightboxItem: () => {
    const { lightboxIndex, lightboxItems } = get();
    if (lightboxIndex !== null && lightboxIndex < lightboxItems.length - 1) {
      set({ lightboxIndex: lightboxIndex + 1 });
    }
  },

  prevLightboxItem: () => {
    const { lightboxIndex } = get();
    if (lightboxIndex !== null && lightboxIndex > 0) {
      set({ lightboxIndex: lightboxIndex - 1 });
    }
  },
}));
