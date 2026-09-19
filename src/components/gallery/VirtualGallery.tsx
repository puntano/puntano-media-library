import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Image as ImageIcon, Film, RotateCcw } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { tauriApi, isTauri } from '../../services/tauriApi';
import { MediaItem, MediaFilterQuery } from '../../types/media';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';
import { useLibraryStore } from '../../stores/libraryStore';

const PAGE_SIZE = 100;
const COLUMNS = 5;

export const VirtualGallery: React.FC = () => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const {
    openLightbox,
    searchQuery,
    hasGpsOnly,
    dateFrom,
    dateTo,
    mediaTypeFilter,
    clearFilters,
    setTotalMediaCount,
  } = useLibraryStore();

  const isFiltering =
    searchQuery.trim().length > 0 ||
    hasGpsOnly ||
    dateFrom !== null ||
    dateTo !== null ||
    mediaTypeFilter !== 'all';

  const loadMediaBatch = useCallback(
    async (offset: number, append: boolean = false) => {
      if (isLoading) return;
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

        setHasMore(result.length === PAGE_SIZE);

        if (offset === 0 && !isFiltering) {
          tauriApi.getTotalMediaCount().then((count) => setTotalMediaCount(count));
        }
      } catch (err) {
        console.error('Failed to load media items:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [isFiltering, searchQuery, dateFrom, dateTo, mediaTypeFilter, hasGpsOnly, isLoading, setTotalMediaCount]
  );

  // Reload from start when search filters change
  useEffect(() => {
    setItems([]);
    setHasMore(true);
    loadMediaBatch(0, false);
  }, [searchQuery, hasGpsOnly, dateFrom, dateTo, mediaTypeFilter]);

  const rowCount = Math.ceil(items.length / COLUMNS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 230,
    overscan: 4,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Infinite Scroll Trigger
  useEffect(() => {
    if (virtualItems.length === 0 || !hasMore || isLoading) return;

    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem && lastItem.index >= rowCount - 2) {
      loadMediaBatch(items.length, true);
    }
  }, [virtualItems, rowCount, hasMore, isLoading, items.length, loadMediaBatch]);

  return (
    <div
      ref={parentRef}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '24px',
      }}
    >
      {/* Empty State */}
      {!isLoading && items.length === 0 && (
        <div
          style={{
            height: '70vh',
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
          const startIndex = virtualRow.index * COLUMNS;
          const rowItems = items.slice(startIndex, startIndex + COLUMNS);

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
                gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
                gap: 16,
                paddingBottom: 16,
              }}
            >
              {rowItems.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => openLightbox(items, startIndex + idx)}
                  className="glass-panel"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '';
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
                      height: 140,
                    }}
                  >
                    <img
                      src={getThumbnailUrl(item.file_hash, item.media_type)}
                      alt={item.file_name}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'opacity 0.2s ease',
                      }}
                      onError={(e) => {
                        const imgEl = e.target as HTMLImageElement;
                        if (isTauri() && !imgEl.src.includes('asset.localhost') && !imgEl.src.startsWith('asset://')) {
                          try {
                            imgEl.src = convertFileSrc(item.file_path);
                            return;
                          } catch {}
                        }
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
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
              ))}
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
    </div>
  );
};
