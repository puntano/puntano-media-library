import React, { useEffect, useState } from 'react';
import { Film, Image as ImageIcon, Calendar } from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { MediaItem, TimelineGroup, MediaFilterQuery } from '../../types/media';
import { useLibraryStore } from '../../stores/libraryStore';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';

export const TimelineView: React.FC = () => {
  const [groups, setGroups] = useState<TimelineGroup[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('all');
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);

  const {
    setSelectedItem,
    openLightbox,
    mediaTypeFilter,
    searchQuery,
    hasGpsOnly,
  } = useLibraryStore();

  useEffect(() => {
    tauriApi.queryTimelineGroups().then((data) => {
      setGroups(data);
      if (data.length > 0) {
        setSelectedPeriod(data[0].period);
      }
    });
  }, []);

  // Fetch items for the active period + active filters
  useEffect(() => {
    if (!selectedPeriod) return;
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
      limit: 200,
      offset: 0,
    };

    tauriApi
      .searchMedia(query)
      .then((data) => {
        setItems(data);
        setIsLoadingItems(false);
      })
      .catch((err) => {
        console.error('Failed to query period media:', err);
        setIsLoadingItems(false);
      });
  }, [selectedPeriod, mediaTypeFilter, searchQuery, hasGpsOnly]);

  const totalTimelineFiles = groups.reduce((acc, g) => acc + g.count, 0);

  // Extract unique years for the filter bar
  const years = Array.from(new Set(groups.map((g) => g.period.split('-')[0]))).sort().reverse();

  const filteredGroups =
    selectedYearFilter === 'all'
      ? groups
      : groups.filter((g) => g.period.startsWith(selectedYearFilter));

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Left Timeline Date Scrubber & Sidebar */}
      <div
        className="glass-panel"
        style={{
          width: 320,
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
            Indexed by DateTimeOriginal
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

        {/* Chronological List of Months / Periods */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {filteredGroups.map((group) => {
            const isSelected = group.period === selectedPeriod;
            return (
              <div
                key={group.period}
                onClick={() => setSelectedPeriod(group.period)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 6,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--surface-glass-hover)' : 'transparent',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {group.period}
                  </div>
                </div>
                <div
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
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
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {selectedPeriod ? `Media from ${selectedPeriod}` : 'Chronological Timeline'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            B-Tree range query executed against SQLite • Click to inspect or open fullscreen lightbox
          </p>
        </div>

        {isLoadingItems ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading period records...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No media found in {selectedPeriod} matching current filters.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 16,
            }}
          >
            {items.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                onDoubleClick={() => openLightbox(items, idx)}
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
                  <img
                    src={getThumbnailUrl(item.file_hash, item.media_type)}
                    alt={item.file_name}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
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
                    {item.captured_at ? new Date(item.captured_at).toLocaleDateString() : 'Unknown date'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
