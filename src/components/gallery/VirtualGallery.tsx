import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  Image as ImageIcon,
  Film,
  RotateCcw,
  Heart,
  Star,
  Check,
  CheckSquare,
  Trash2,
  FolderPlus,
  FolderMinus,
  Tag as TagIcon,
  SlidersHorizontal,
  AlertTriangle,
  X,
  Plus,
  Copy,
  Download,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { tauriApi, isTauri } from '../../services/tauriApi';
import { MediaItem, MediaFilterQuery, Tag } from '../../types/media';
import { useLibraryStore } from '../../stores/libraryStore';
import { MediaThumbnail } from '../common/MediaThumbnail';
import { AddToAlbumModal } from '../albums/AddToAlbumModal';

const PAGE_SIZE = 100;

const TAG_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
];

export const VirtualGallery: React.FC = () => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Modals and feedback for batch actions
  const [showBatchAlbum, setShowBatchAlbum] = useState<boolean>(false);
  const [showBatchTag, setShowBatchTag] = useState<boolean>(false);
  const [showBatchDelete, setShowBatchDelete] = useState<boolean>(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLORS[0]);
  const [isCopiedFeedback, setIsCopiedFeedback] = useState<boolean>(false);
  const [batchStatusFeedback, setBatchStatusFeedback] = useState<string | null>(null);

  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const itemsLengthRef = useRef(0);
  itemsLengthRef.current = items.length;
  hasMoreRef.current = hasMore;
  isLoadingRef.current = isLoading;

  const {
    openLightbox,
    searchQuery,
    hasGpsOnly,
    isFavoriteOnly,
    minRating,
    selectedAlbumId,
    selectedTagId,
    setSelectedTagId,
    dateFrom,
    dateTo,
    mediaTypeFilter,
    clearFilters,
    setTotalMediaCount,
    syncRevision,
    incrementSyncRevision,
    galleryColumns,
    setGalleryColumns,
    isSelectionMode,
    setSelectionMode,
    selectedMediaIds,
    toggleMediaSelection,
    selectAllMedia,
    clearMediaSelection,
    sortBy,
    sortOrder,
  } = useLibraryStore();

  const selectedSet = useMemo(() => new Set(selectedMediaIds), [selectedMediaIds]);

  const isFiltering =
    searchQuery.trim().length > 0 ||
    hasGpsOnly ||
    isFavoriteOnly ||
    minRating > 0 ||
    selectedAlbumId !== null ||
    selectedTagId !== null ||
    dateFrom !== null ||
    dateTo !== null ||
    mediaTypeFilter !== 'all' ||
    sortBy !== 'date' ||
    sortOrder !== 'desc';

  const loadMediaBatch = useCallback(
    async (offset: number, append: boolean = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        let result: MediaItem[] = [];

        if (isFiltering) {
          const query: MediaFilterQuery = {
            query_text: searchQuery.trim() || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            media_type: mediaTypeFilter === 'all' ? undefined : mediaTypeFilter,
            has_gps_only: hasGpsOnly ? true : undefined,
            is_favorite_only: isFavoriteOnly ? true : undefined,
            min_rating: minRating > 0 ? minRating : undefined,
            album_id: selectedAlbumId || undefined,
            tag_id: selectedTagId || undefined,
            sort_by: sortBy,
            sort_order: sortOrder,
            limit: PAGE_SIZE,
            offset,
          };
          result = await tauriApi.searchMedia(query);
        } else {
          result = await tauriApi.queryMediaPaged(PAGE_SIZE, offset);
        }

        if (append) {
          setItems((prev) => [...prev, ...result]);
        } else {
          setItems(result);
        }

        const moreAvailable = result.length === PAGE_SIZE;
        hasMoreRef.current = moreAvailable;
        setHasMore(moreAvailable);

        if (offset === 0 && !isFiltering) {
          tauriApi.getTotalMediaCount().then((count) => setTotalMediaCount(count));
        }
      } catch (err) {
        console.error('Failed to load media items:', err);
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [
      isFiltering,
      searchQuery,
      dateFrom,
      dateTo,
      mediaTypeFilter,
      hasGpsOnly,
      isFavoriteOnly,
      minRating,
      selectedAlbumId,
      selectedTagId,
      sortBy,
      sortOrder,
      setTotalMediaCount,
    ]
  );

  const handleToggleFavorite = async (e: React.MouseEvent, item: MediaItem) => {
    e.stopPropagation();
    const nextFavorite = !item.is_favorite;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_favorite: nextFavorite } : i))
    );
    try {
      await tauriApi.setMediaFavorite(item.id, nextFavorite);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_favorite: item.is_favorite } : i))
      );
    }
  };

  // Batch actions
  const handleBatchFavorite = async (makeFavorite: boolean) => {
    if (selectedMediaIds.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    try {
      await tauriApi.batchSetMediaFavorite(selectedMediaIds, makeFavorite);
      setItems((prev) =>
        prev.map((i) => (selectedSet.has(i.id) ? { ...i, is_favorite: makeFavorite } : i))
      );
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to set batch favorite:', err);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleOpenBatchTag = async () => {
    try {
      const tags = await tauriApi.getTags();
      setAvailableTags(tags);
      setShowBatchTag(true);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  };

  const handleApplyBatchTag = async (tagId: number) => {
    if (selectedMediaIds.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    try {
      await tauriApi.batchAddTagToMedia(selectedMediaIds, tagId);
      setShowBatchTag(false);
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to apply batch tag:', err);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleCreateAndApplyBatchTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTagInput.trim();
    if (!name || isBatchProcessing) return;
    setIsBatchProcessing(true);
    try {
      const tag = await tauriApi.createTag(name, newTagColor);
      await tauriApi.batchAddTagToMedia(selectedMediaIds, tag.id);
      setNewTagInput('');
      setShowBatchTag(false);
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to create and apply batch tag:', err);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleDeleteTagGlobal = async (tagId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await tauriApi.deleteTag(tagId);
      setAvailableTags((prev) => prev.filter((t) => t.id !== tagId));
      if (selectedTagId === tagId) {
        setSelectedTagId(null);
      }
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to delete tag:', err);
    }
  };

  const handleRemoveFromCurrentAlbum = async () => {
    if (!selectedAlbumId || selectedMediaIds.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    try {
      const count = selectedMediaIds.length;
      await tauriApi.removeMediaFromAlbum(selectedAlbumId, selectedMediaIds);
      const removedSet = new Set(selectedMediaIds);
      setItems((prev) => prev.filter((i) => !removedSet.has(i.id)));
      clearMediaSelection();
      incrementSyncRevision();
      setBatchStatusFeedback(`Removed ${count} ${count === 1 ? 'item' : 'items'} from album`);
      setTimeout(() => setBatchStatusFeedback(null), 3000);
    } catch (err) {
      console.error('Failed to remove items from album:', err);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleSetCurrentAlbumCover = async () => {
    if (!selectedAlbumId || selectedMediaIds.length !== 1 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    try {
      const allAlbums = await tauriApi.getAlbums();
      const currentAlbum = allAlbums.find((a) => a.id === selectedAlbumId);
      if (currentAlbum) {
        await tauriApi.updateAlbum(
          currentAlbum.id,
          currentAlbum.name,
          currentAlbum.description,
          selectedMediaIds[0]
        );
        incrementSyncRevision();
        setBatchStatusFeedback(`Set cover for "${currentAlbum.name}"`);
        setTimeout(() => setBatchStatusFeedback(null), 3000);
      }
    } catch (err) {
      console.error('Failed to set album cover:', err);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleExecuteBatchDelete = async (deleteFromDisk: boolean) => {
    if (selectedMediaIds.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    try {
      await tauriApi.batchDeleteMedia(selectedMediaIds, deleteFromDisk);
      const toRemove = new Set(selectedMediaIds);
      setItems((prev) => prev.filter((i) => !toRemove.has(i.id)));
      clearMediaSelection();
      setShowBatchDelete(false);
      incrementSyncRevision();
      tauriApi.getTotalMediaCount().then((c) => setTotalMediaCount(c));
    } catch (err) {
      console.error('Failed to delete media in batch:', err);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleCopySelectedPaths = async () => {
    if (selectedMediaIds.length === 0) return;
    const paths = items
      .filter((i) => selectedSet.has(i.id))
      .map((i) => i.file_path);
    if (paths.length === 0) return;

    try {
      await navigator.clipboard.writeText(paths.join('\n'));
      setIsCopiedFeedback(true);
      setBatchStatusFeedback(`Copied ${paths.length} file ${paths.length === 1 ? 'path' : 'paths'} to clipboard`);
      setTimeout(() => {
        setIsCopiedFeedback(false);
        setBatchStatusFeedback(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy paths to clipboard:', err);
    }
  };

  const handleExportSelected = async () => {
    if (selectedMediaIds.length === 0 || isBatchProcessing) return;
    const paths = items
      .filter((i) => selectedSet.has(i.id))
      .map((i) => i.file_path);
    if (paths.length === 0) return;

    let destinationFolder: string | null = null;
    if (isTauri()) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Destination Folder for Export',
        });
        if (selected && typeof selected === 'string') {
          destinationFolder = selected;
        }
      } catch (err) {
        console.error('Folder picker error:', err);
        return;
      }
    } else {
      destinationFolder = prompt('Enter export destination folder path:');
    }

    if (!destinationFolder) return;

    setIsBatchProcessing(true);
    setBatchStatusFeedback('Exporting selected files...');
    try {
      const exportedCount = await tauriApi.exportMediaFiles(paths, destinationFolder);
      setBatchStatusFeedback(`Exported ${exportedCount} ${exportedCount === 1 ? 'file' : 'files'} to ${destinationFolder}`);
      setTimeout(() => setBatchStatusFeedback(null), 4000);
    } catch (err) {
      console.error('Export failed:', err);
      setBatchStatusFeedback('Export failed. Check disk permissions.');
      setTimeout(() => setBatchStatusFeedback(null), 4000);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Keyboard shortcuts in Gallery
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAllMedia(items.map((i) => i.id));
      } else if (e.key === 'Escape' && selectedMediaIds.length > 0) {
        clearMediaSelection();
      } else if (['3', '4', '5', '6', '7', '8'].includes(e.key)) {
        setGalleryColumns(parseInt(e.key, 10));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedMediaIds.length, selectAllMedia, clearMediaSelection, setGalleryColumns]);

  // Reload from start when search filters change or background watcher syncs
  useEffect(() => {
    setItems([]);
    setHasMore(true);
    hasMoreRef.current = true;
    loadMediaBatch(0, false);
  }, [
    searchQuery,
    hasGpsOnly,
    isFavoriteOnly,
    minRating,
    selectedAlbumId,
    selectedTagId,
    dateFrom,
    dateTo,
    mediaTypeFilter,
    sortBy,
    sortOrder,
    syncRevision,
    loadMediaBatch,
  ]);

  const rowCount = Math.ceil(items.length / galleryColumns);
  const estimatedRowHeight = Math.round(1120 / galleryColumns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 4,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Infinite Scroll Trigger
  useEffect(() => {
    if (virtualItems.length === 0 || !hasMoreRef.current || isLoadingRef.current) return;

    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem && lastItem.index >= rowCount - 2) {
      loadMediaBatch(itemsLengthRef.current, true);
    }
  }, [virtualItems, rowCount, loadMediaBatch]);

  return (
    <div
      ref={parentRef}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '16px 24px 80px 24px',
        position: 'relative',
      }}
    >
      {/* Top Toolbar: Density & Selection Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--surface-glass-border)',
        }}
      >
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>
            {items.length.toLocaleString()} {items.length === 1 ? 'item' : 'items'} loaded
          </span>
          {isFiltering && (
            <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, background: 'var(--accent-glow)', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Filtered
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Grid Density Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {galleryColumns} cols
            </span>
            <input
              type="range"
              min={3}
              max={8}
              value={galleryColumns}
              onChange={(e) => setGalleryColumns(parseInt(e.target.value, 10))}
              style={{
                width: 90,
                accentColor: 'var(--accent-primary)',
                cursor: 'pointer',
              }}
              title="Adjust grid density (keys 3-8)"
            />
          </div>

          <div style={{ width: 1, height: 16, backgroundColor: 'var(--surface-glass-border)' }} />

          {/* Selection Mode Toggle */}
          <button
            onClick={() => setSelectionMode(!isSelectionMode)}
            style={{
              background: isSelectionMode ? 'var(--accent-primary)' : 'transparent',
              color: isSelectionMode ? '#ffffff' : 'var(--text-secondary)',
              border: `1px solid ${isSelectionMode ? 'var(--accent-primary)' : 'var(--surface-glass-border)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <CheckSquare size={13} />
            {isSelectionMode ? 'Exit Select' : 'Select'}
          </button>
        </div>
      </div>

      {/* Empty State */}
      {!isLoading && items.length === 0 && (
        <div
          style={{
            height: '65vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'var(--surface-glass-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
            }}
          >
            {isFiltering ? <Search size={28} /> : <ImageIcon size={28} />}
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {isFiltering ? 'No matching media files' : 'Your media library is empty'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4, maxWidth: 400 }}>
              {isFiltering
                ? 'Try adjusting your search query, date ranges, or GPS filter options.'
                : 'Index a local folder to start exploring your photos and videos with sub-millisecond timeline and spatial queries.'}
            </p>
          </div>
          {isFiltering && (
            <button
              className="btn-secondary"
              onClick={clearFilters}
              style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RotateCcw size={13} />
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {/* Virtualized Grid */}
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const startIndex = virtualRow.index * galleryColumns;
          const rowItems = items.slice(startIndex, startIndex + galleryColumns);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${galleryColumns}, 1fr)`,
                gap: 16,
                paddingBottom: 16,
              }}
            >
              {rowItems.map((item, idx) => {
                const isSelected = selectedSet.has(item.id);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleMediaSelection(item.id);
                      } else {
                        openLightbox(items, startIndex + idx);
                      }
                    }}
                    className="glass-panel"
                    style={{
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      position: 'relative',
                      border: isSelected
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--surface-glass-border)',
                      boxShadow: isSelected ? '0 0 16px rgba(59, 130, 246, 0.35)' : undefined,
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      if (!isSelected) e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      if (!isSelected) e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        height: Math.max(100, Math.round(140 * (5 / galleryColumns))),
                      }}
                    >
                      <MediaThumbnail
                        filePath={item.file_path}
                        fileHash={item.file_hash}
                        mediaType={item.media_type}
                        orientation={item.orientation}
                        alt={item.file_name}
                        style={{ transition: 'opacity 0.2s ease' }}
                      />

                      {/* Selection Checkbox */}
                      {(isSelectionMode || isSelected) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMediaSelection(item.id);
                          }}
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            backgroundColor: isSelected ? 'var(--accent-primary)' : 'rgba(0, 0, 0, 0.55)',
                            backdropFilter: 'blur(4px)',
                            border: `2px solid ${isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            padding: 0,
                            zIndex: 2,
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </button>
                      )}

                      {/* Favorite Button (only shown if not in selection mode or if already favorite) */}
                      {!isSelectionMode && (
                        <button
                          onClick={(e) => handleToggleFavorite(e, item)}
                          title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            padding: 5,
                            borderRadius: 6,
                            backgroundColor: item.is_favorite ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 0, 0, 0.55)',
                            backdropFilter: 'blur(4px)',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Heart size={12} fill={item.is_favorite ? '#ffffff' : 'none'} />
                        </button>
                      )}

                      {/* Top Right Badges */}
                      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                        {item.rating > 0 && (
                          <div
                            style={{
                              padding: '3px 6px',
                              borderRadius: 4,
                              backgroundColor: 'rgba(0, 0, 0, 0.65)',
                              backdropFilter: 'blur(4px)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: '#fbbf24',
                            }}
                          >
                            <Star size={10} fill="#fbbf24" />
                            <span>{item.rating}</span>
                          </div>
                        )}
                        <div
                          style={{
                            padding: '3px 6px',
                            borderRadius: 4,
                            backgroundColor: 'rgba(0, 0, 0, 0.65)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.media_type === 'video' ? <Film size={11} color="#ffffff" /> : <ImageIcon size={11} color="#ffffff" />}
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--surface-glass-border)' }}>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.file_name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        <span>{(item.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                        {item.captured_at && (
                          <span>{new Date(item.captured_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Bottom Loading Indicator */}
      {isLoading && items.length > 0 && (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Loading more media records...
        </div>
      )}

      {/* Floating Batch Actions Bar */}
      {selectedMediaIds.length > 0 && (
        <div
          className="glass-panel"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            borderRadius: 999,
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--surface-glass-border)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 12,
              backgroundColor: 'var(--accent-primary)',
              color: '#ffffff',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            {selectedMediaIds.length} selected
          </div>

          <button
            className="btn-secondary"
            onClick={() => selectAllMedia(items.map((i) => i.id))}
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
          >
            Select All ({items.length})
          </button>

          <button
            className="btn-secondary"
            onClick={handleCopySelectedPaths}
            style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 5 }}
            title="Copy absolute file paths of selected items to clipboard"
          >
            {isCopiedFeedback ? <Check size={13} color="var(--status-success)" /> : <Copy size={13} />}
            {isCopiedFeedback ? 'Copied!' : 'Copy Paths'}
          </button>

          <button
            className="btn-secondary"
            onClick={handleExportSelected}
            disabled={isBatchProcessing}
            style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 5 }}
            title="Export copies of selected items to a folder"
          >
            <Download size={13} />
            Export
          </button>

          <button
            className="btn-secondary"
            onClick={() => handleBatchFavorite(true)}
            style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 5 }}
            title="Mark all selected as favorite"
          >
            <Heart size={13} fill="#ef4444" color="#ef4444" />
            Favorite
          </button>

          <button
            className="btn-secondary"
            onClick={() => setShowBatchAlbum(true)}
            style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 5 }}
            title="Add selected items to an album"
          >
            <FolderPlus size={13} />
            Add to Album
          </button>

          {selectedAlbumId !== null && (
            <>
              {selectedMediaIds.length === 1 && (
                <button
                  className="btn-secondary"
                  onClick={handleSetCurrentAlbumCover}
                  disabled={isBatchProcessing}
                  style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 5 }}
                  title="Set selected item as the cover for this album"
                >
                  <ImageIcon size={13} color="var(--accent-primary)" />
                  Set Cover
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={handleRemoveFromCurrentAlbum}
                disabled={isBatchProcessing}
                style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 5 }}
                title="Remove selected items from this album (keeps files in library)"
              >
                <FolderMinus size={13} />
                Remove from Album
              </button>
            </>
          )}

          <button
            className="btn-secondary"
            onClick={handleOpenBatchTag}
            style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 5 }}
            title="Add tag to selected items"
          >
            <TagIcon size={13} />
            Tag
          </button>

          <button
            onClick={() => setShowBatchDelete(true)}
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              gap: 5,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontWeight: 600,
            }}
            title="Delete selected media"
          >
            <Trash2 size={13} />
            Delete
          </button>

          <button
            onClick={clearMediaSelection}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Clear selection (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Floating Status Notification */}
      {batchStatusFeedback && (
        <div
          className="glass-panel"
          style={{
            position: 'fixed',
            bottom: 84,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 110,
            borderRadius: 999,
            padding: '8px 20px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--accent-primary)',
            color: '#ffffff',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <Check size={14} color="var(--accent-primary)" />
          <span>{batchStatusFeedback}</span>
        </div>
      )}

      {/* Batch Album Modal */}
      {showBatchAlbum && (
        <AddToAlbumModal
          mediaIds={selectedMediaIds}
          onClose={() => setShowBatchAlbum(false)}
        />
      )}

      {/* Batch Tag Modal */}
      {showBatchTag && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowBatchTag(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: 400,
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              backgroundColor: 'var(--bg-secondary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TagIcon size={16} color="var(--accent-primary)" />
                Tag {selectedMediaIds.length} Items
              </h3>
              <button
                onClick={() => setShowBatchTag(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Existing tags list */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, maxHeight: 150, overflowY: 'auto' }}>
              {availableTags.map((t) => (
                <div
                  key={t.id}
                  style={{
                    padding: '4px 8px 4px 10px',
                    borderRadius: 14,
                    fontSize: '0.78rem',
                    border: `1px solid ${t.color || '#3b82f6'}55`,
                    backgroundColor: `${t.color || '#3b82f6'}22`,
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleApplyBatchTag(t.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ffffff',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: '0.78rem',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.color }} />
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteTagGlobal(t.id, e)}
                    title={`Delete tag "${t.name}" globally`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            {/* Create new tag */}
            <form onSubmit={handleCreateAndApplyBatchTag} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Or create new tag..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--surface-glass-border)',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                  }}
                />
                <button type="submit" disabled={!newTagInput.trim()} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  <Plus size={14} /> Add
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Color:</span>
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    title={`Select color ${color}`}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: color,
                      border: newTagColor === color ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.2)',
                      cursor: 'pointer',
                      padding: 0,
                      transform: newTagColor === color ? 'scale(1.15)' : 'scale(1)',
                      transition: 'transform 0.1s ease',
                    }}
                  />
                ))}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !isBatchProcessing && setShowBatchDelete(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: 440,
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444', marginBottom: 12 }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                Delete {selectedMediaIds.length} Items
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              Choose whether to remove the {selectedMediaIds.length} selected files from the Puntano index or move them to your OS Recycle Bin / Trash.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-secondary"
                disabled={isBatchProcessing}
                onClick={() => handleExecuteBatchDelete(false)}
                style={{
                  justifyContent: 'flex-start',
                  padding: '10px 14px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Remove from Library only</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Keeps physical files on disk; removes records from the database index.
                </div>
              </button>

              <button
                disabled={isBatchProcessing}
                onClick={() => handleExecuteBatchDelete(true)}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  textAlign: 'left',
                  cursor: isBatchProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trash2 size={13} />
                  Move to Recycle Bin / Trash
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(239, 68, 68, 0.8)' }}>
                  Moves all {selectedMediaIds.length} files to your system Recycle Bin / Trash and removes them from the index.
                </div>
              </button>

              <button
                className="btn-secondary"
                disabled={isBatchProcessing}
                onClick={() => setShowBatchDelete(false)}
                style={{ marginTop: 6, justifyContent: 'center' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
