import { create } from 'zustand';
import { IndexingProgressEvent, MediaItem } from '../types/media';

interface LibraryState {
  activeView: 'map' | 'timeline' | 'gallery' | 'albums';
  totalMediaCount: number;
  isIndexing: boolean;
  indexingProgress: IndexingProgressEvent | null;
  selectedItem: MediaItem | null;
  isInspectorOpen: boolean;
  mediaTypeFilter: 'all' | 'photo' | 'video';

  // Search & Filter State
  searchQuery: string;
  hasGpsOnly: boolean;
  isFavoriteOnly: boolean;
  minRating: number;
  selectedAlbumId: number | null;
  selectedTagId: number | null;
  dateFrom: number | null;
  dateTo: number | null;

  // Modals & Panels
  isDuplicateModalOpen: boolean;

  // Fullscreen Lightbox State
  lightboxIndex: number | null;
  lightboxItems: MediaItem[];

  // Gallery Density & Batch Selection State
  galleryColumns: number;
  isSelectionMode: boolean;
  selectedMediaIds: number[];

  // Keyboard Shortcuts Modal State
  isShortcutsModalOpen: boolean;

  // Reactive Sync Revision (triggers view reloads on background watcher sync)
  syncRevision: number;

  setActiveView: (view: 'map' | 'timeline' | 'gallery' | 'albums') => void;
  setTotalMediaCount: (count: number) => void;
  setIsIndexing: (isIndexing: boolean) => void;
  setIndexingProgress: (progress: IndexingProgressEvent | null) => void;
  setSelectedItem: (item: MediaItem | null) => void;
  setInspectorOpen: (open: boolean) => void;
  setMediaTypeFilter: (filter: 'all' | 'photo' | 'video') => void;
  incrementSyncRevision: () => void;

  setSearchQuery: (query: string) => void;
  setHasGpsOnly: (hasGps: boolean) => void;
  setIsFavoriteOnly: (isFav: boolean) => void;
  setMinRating: (rating: number) => void;
  setSelectedAlbumId: (id: number | null) => void;
  setSelectedTagId: (id: number | null) => void;
  setDateRange: (from: number | null, to: number | null) => void;
  setDuplicateModalOpen: (open: boolean) => void;
  clearFilters: () => void;

  setGalleryColumns: (cols: number) => void;
  setSelectionMode: (active: boolean) => void;
  toggleMediaSelection: (id: number) => void;
  selectAllMedia: (ids: number[]) => void;
  clearMediaSelection: () => void;
  setShortcutsModalOpen: (open: boolean) => void;

  openLightbox: (items: MediaItem[], index: number) => void;
  closeLightbox: () => void;
  nextLightboxItem: () => void;
  prevLightboxItem: () => void;
}

const getSavedColumns = (): number => {
  if (typeof window === 'undefined') return 5;
  try {
    const saved = localStorage.getItem('puntano_gallery_columns');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed >= 3 && parsed <= 8) return parsed;
    }
  } catch {}
  return 5;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  activeView: 'map',
  totalMediaCount: 0,
  isIndexing: false,
  indexingProgress: null,
  selectedItem: null,
  isInspectorOpen: false,
  mediaTypeFilter: 'all',
  syncRevision: 0,

  searchQuery: '',
  hasGpsOnly: false,
  isFavoriteOnly: false,
  minRating: 0,
  selectedAlbumId: null,
  selectedTagId: null,
  dateFrom: null,
  dateTo: null,
  isDuplicateModalOpen: false,

  galleryColumns: getSavedColumns(),
  isSelectionMode: false,
  selectedMediaIds: [],
  isShortcutsModalOpen: false,

  lightboxIndex: null,
  lightboxItems: [],

  setActiveView: (view) => set({ activeView: view }),
  setTotalMediaCount: (count) => set({ totalMediaCount: count }),
  setIsIndexing: (isIndexing) => set({ isIndexing }),
  setIndexingProgress: (indexingProgress) => set({ indexingProgress }),
  setSelectedItem: (selectedItem) => set({ selectedItem, isInspectorOpen: selectedItem !== null }),
  setInspectorOpen: (isInspectorOpen) => set({ isInspectorOpen }),
  setMediaTypeFilter: (mediaTypeFilter) => set({ mediaTypeFilter }),
  incrementSyncRevision: () => set((state) => ({ syncRevision: state.syncRevision + 1 })),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setHasGpsOnly: (hasGpsOnly) => set({ hasGpsOnly }),
  setIsFavoriteOnly: (isFavoriteOnly) => set({ isFavoriteOnly }),
  setMinRating: (minRating) => set({ minRating }),
  setSelectedAlbumId: (selectedAlbumId) => set({ selectedAlbumId }),
  setSelectedTagId: (selectedTagId) => set({ selectedTagId }),
  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo }),
  setDuplicateModalOpen: (isDuplicateModalOpen) => set({ isDuplicateModalOpen }),
  clearFilters: () =>
    set({
      searchQuery: '',
      hasGpsOnly: false,
      isFavoriteOnly: false,
      minRating: 0,
      selectedAlbumId: null,
      selectedTagId: null,
      dateFrom: null,
      dateTo: null,
      mediaTypeFilter: 'all',
    }),

  setGalleryColumns: (cols: number) => {
    const clamped = Math.max(3, Math.min(8, cols));
    try {
      localStorage.setItem('puntano_gallery_columns', clamped.toString());
    } catch {}
    set({ galleryColumns: clamped });
  },

  setSelectionMode: (isSelectionMode) => {
    set({ isSelectionMode, selectedMediaIds: isSelectionMode ? get().selectedMediaIds : [] });
  },

  toggleMediaSelection: (id: number) => {
    const current = get().selectedMediaIds;
    if (current.includes(id)) {
      set({ selectedMediaIds: current.filter((x) => x !== id) });
    } else {
      set({ selectedMediaIds: [...current, id], isSelectionMode: true });
    }
  },

  selectAllMedia: (ids: number[]) => {
    set({ selectedMediaIds: ids, isSelectionMode: true });
  },

  clearMediaSelection: () => {
    set({ selectedMediaIds: [], isSelectionMode: false });
  },

  setShortcutsModalOpen: (isShortcutsModalOpen) => set({ isShortcutsModalOpen }),

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
