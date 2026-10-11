import React, { useEffect, useState, useMemo } from 'react';
import { Film, Image as ImageIcon, Calendar, ArrowUpDown, Maximize2, Heart, Star } from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { MediaItem, TimelineGroup, MediaFilterQuery } from '../../types/media';
import { useLibraryStore } from '../../stores/libraryStore';
import { MediaThumbnail } from '../common/MediaThumbnail';

const PAGE_SIZE = 120;

export const TimelineView: React.FC = () => {
  const [groups, setGroups] = useState<TimelineGroup[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('all');
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  const {
    setSelectedItem,
    openLightbox,
    mediaTypeFilter,
    searchQuery,
    hasGpsOnly,
    isFavoriteOnly,
    minRating,
    selectedAlbumId,
    selectedTagId,
    totalMediaCount,
    isIndexing,
    syncRevision,
  } = useLibraryStore();

  // Load timeline month groups
  useEffect(() => {
    tauriApi
      .queryTimelineGroups()
      .then((data) => {
        setGroups(data);
        if (data.length > 0) {
          setSelectedPeriod((prev) => {
            if (prev && data.some((d) => d.period === prev)) {
              return prev;
            }
            return data[0].period;
          });
        } else {
          setSelectedPeriod(null);
        }
      })
      .catch((err) => {
        console.error('Failed to load timeline groups:', err);
      });
  }, [totalMediaCount, isIndexing, syncRevision]);

  // Fetch initial items for the active period + active filters
  useEffect(() => {
    if (!selectedPeriod) {
      setItems([]);
      setHasMore(false);
      return;
    }

    setIsLoadingItems(true);

    const [yearStr, monthStr] = selectedPeriod.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).getTime();
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();

    const query: MediaFilterQuery = {
      date_from: startDate,
      date_to: endDate,
      media_type: mediaTypeFilter === 'all' ? undefined : mediaTypeFilter,
      query_text: searchQuery.trim() || undefined,
      has_gps_only: hasGpsOnly ? true : undefined,
      is_favorite_only: isFavoriteOnly ? true : undefined,
      min_rating: minRating > 0 ? minRating : undefined,
      album_id: selectedAlbumId || undefined,
      tag_id: selectedTagId || undefined,
      limit: PAGE_SIZE,
      offset: 0,
    };

    tauriApi
      .searchMedia(query)
      .then((data) => {
        setItems(data);
        setHasMore(data.length >= PAGE_SIZE);
        setIsLoadingItems(false);
      })
      .catch((err) => {
        console.error('Failed to query period media:', err);
        setIsLoadingItems(false);
      });
  }, [
    selectedPeriod,
    mediaTypeFilter,
    searchQuery,
    hasGpsOnly,
    isFavoriteOnly,
    minRating,
    selectedAlbumId,
    selectedTagId,
    syncRevision,
  ]);

  // Load next batch of items for current period
  const handleLoadMore = () => {
    if (!selectedPeriod || isLoadingMore) return;
    setIsLoadingMore(true);

    const [yearStr, monthStr] = selectedPeriod.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).getTime();
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();

    const query: MediaFilterQuery = {
      date_from: startDate,
      date_to: endDate,
      media_type: mediaTypeFilter === 'all' ? undefined : mediaTypeFilter,
      query_text: searchQuery.trim() || undefined,
      has_gps_only: hasGpsOnly ? true : undefined,
      is_favorite_only: isFavoriteOnly ? true : undefined,
      min_rating: minRating > 0 ? minRating : undefined,
      album_id: selectedAlbumId || undefined,
      tag_id: selectedTagId || undefined,
      limit: PAGE_SIZE,
      offset: items.length,
    };

    tauriApi
      .searchMedia(query)
      .then((newItems) => {
        setItems((prev) => [...prev, ...newItems]);
        setHasMore(newItems.length >= PAGE_SIZE);
        setIsLoadingMore(false);
      })
      .catch((err) => {
        console.error('Failed to load more media:', err);
        setIsLoadingMore(false);
      });
  };

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
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_favorite: item.is_favorite } : i))
      );
    }
  };

  const totalTimelineFiles = groups.reduce((acc, g) => acc + g.count, 0);

  // Extract unique years for the filter bar
  const years = Array.from(new Set(groups.map((g) => g.period.split('-')[0]))).sort().reverse();

  const filteredGroups =
    selectedYearFilter === 'all'
      ? groups
      : groups.filter((g) => g.period.startsWith(selectedYearFilter));

  const formatPeriodTitle = (periodStr: string) => {
    const [y, m] = periodStr.split('-');
    if (!y || !m) return periodStr;
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  // Group items by Day for clean chronological sub-sections
  const groupedByDay = useMemo(() => {
    const groupsMap = new Map<string, { label: string; dateVal: number; items: MediaItem[] }>();

    for (const item of items) {
      const ts = item.captured_at || item.file_modified_at;
      if (!ts) {
        const entry = groupsMap.get('undated') || { label: 'Undated Media', dateVal: 0, items: [] };
        entry.items.push(item);
        groupsMap.set('undated', entry);
        continue;
      }

      const d = new Date(ts);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const entry = groupsMap.get(dayKey) || { label, dateVal: ts, items: [] };
      entry.items.push(item);
      groupsMap.set(dayKey, entry);
    }

    const list = Array.from(groupsMap.values());
    list.sort((a, b) => (sortDirection === 'desc' ? b.dateVal - a.dateVal : a.dateVal - b.dateVal));
    return list;
  }, [items, sortDirection]);

  // Fast O(1) index lookup map to eliminate N^2 searches during rendering
  const itemIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < items.length; i++) {
      map.set(items[i].id, i);
    }
    return map;
  }, [items]);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Left Timeline Date Scrubber & Sidebar */}
      <div
        className="glass-panel"
        style={{
          width: 330,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--surface-glass-border)',
          zIndex: 10,
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--surface-glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Calendar size={13} />
            Chronological Archive
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            {totalTimelineFiles.toLocaleString()} Items
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Indexed by DateTimeOriginal & modified timestamps
          </div>

          {/* Quick Year Filter Chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, overflowX: 'auto', paddingBottom: 4 }}>
            <button
              onClick={() => setSelectedYearFilter('all')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: selectedYearFilter === 'all' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: selectedYearFilter === 'all' ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              All
            </button>
            {years.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYearFilter(year)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: selectedYearFilter === year ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: selectedYearFilter === year ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* Chronological List of Months / Periods with Cover Thumbnails */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {filteredGroups.map((group) => {
            const isSelected = group.period === selectedPeriod;
            return (
              <div
                key={group.period}
                onClick={() => setSelectedPeriod(group.period)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 6,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--surface-glass-hover)' : 'transparent',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Cover Thumbnail */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--surface-glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {group.cover_file_path ? (
                    <MediaThumbnail
                      filePath={group.cover_file_path}
                      fileHash={group.cover_file_hash || `hash_${group.cover_id || 0}`}
                      mediaType="photo"
                      alt={group.period}
                    />
                  ) : (
                    <Calendar size={18} color="var(--text-muted)" />
                  )}
                </div>

                {/* Period Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {formatPeriodTitle(group.period)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {group.period}
                  </div>
                </div>

                {/* Count Badge */}
                <div
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    flexShrink: 0,
                  }}
                >
                  {group.count.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Period Content Area */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {/* Period Top Action Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: '1px solid var(--surface-glass-border)',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
              {selectedPeriod ? formatPeriodTitle(selectedPeriod) : 'Chronological Timeline'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: 4, marginBottom: 0 }}>
              {selectedPeriod ? `${selectedPeriod} • ` : ''}
              Sub-millisecond B-Tree queries executed against SQLite
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Sort Order Toggle */}
            <button
              className="btn-secondary"
              onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              style={{ fontSize: '0.75rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              title={`Switch to ${sortDirection === 'desc' ? 'oldest' : 'newest'} first`}
            >
              <ArrowUpDown size={13} />
              {sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
            </button>

            {/* View Fullscreen Lightbox Button */}
            {items.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() => openLightbox(items, 0)}
                style={{ fontSize: '0.75rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                title="View period photos in fullscreen lightbox"
              >
                <Maximize2 size={13} />
                View in Lightbox
              </button>
            )}
          </div>
        </div>

        {/* Content State Handling */}
        {isLoadingItems ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading period records...
          </div>
        ) : groups.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Calendar size={40} style={{ margin: '0 auto 14px auto', opacity: 0.4 }} />
            <div style={{ fontWeight: 600, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
              No timeline groups available
            </div>
            <div style={{ fontSize: '0.875rem', marginTop: 6 }}>
              Index a local folder to organize your photos and videos by capture and creation dates.
            </div>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
              No media found in {selectedPeriod ? formatPeriodTitle(selectedPeriod) : 'selected period'} matching active filters.
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: 6 }}>
              Try adjusting your search query, media type, or GPS filter.
            </div>
          </div>
        ) : (
          <div>
            {/* Day Sections */}
            {groupedByDay.map((dayGroup) => (
              <div key={dayGroup.label} style={{ marginBottom: 32 }}>
                {/* Day Header Divider */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 8,
                    marginBottom: 16,
                    borderBottom: '1px solid var(--surface-glass-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={14} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {dayGroup.label}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {dayGroup.items.length} {dayGroup.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {/* Day Media Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 16,
                  }}
                >
                  {dayGroup.items.map((item) => {
                    const overallIndex = itemIndexMap.get(item.id) ?? 0;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        onDoubleClick={() => openLightbox(items, overallIndex >= 0 ? overallIndex : 0)}
                        title="Click to inspect, double-click for fullscreen lightbox"
                        className="glass-panel"
                        style={{
                          aspectRatio: '1',
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          position: 'relative',
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
                        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                          <MediaThumbnail
                            filePath={item.file_path}
                            fileHash={item.file_hash}
                            mediaType={item.media_type}
                            alt={item.file_name}
                          />
                          {/* Favorite Button */}
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
                              zIndex: 10,
                            }}
                          >
                            <Heart size={12} fill={item.is_favorite ? '#ffffff' : 'none'} />
                          </button>

                          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 10 }}>
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
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {item.captured_at
                              ? new Date(item.captured_at).toLocaleDateString()
                              : item.file_modified_at
                              ? new Date(item.file_modified_at).toLocaleDateString()
                              : 'Unknown date'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Pagination Load More Button */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 32 }}>
                <button
                  className="btn-secondary"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  style={{ padding: '8px 24px', fontSize: '0.85rem' }}
                >
                  {isLoadingMore ? 'Loading next batch...' : `Load more (${items.length} loaded)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
