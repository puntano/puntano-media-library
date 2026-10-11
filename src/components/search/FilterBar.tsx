import React, { useEffect, useState } from 'react';
import { Search, MapPin, X, RotateCcw, Calendar, Heart, Star, Folder, Tag as TagIcon } from 'lucide-react';
import { useLibraryStore } from '../../stores/libraryStore';

export const FilterBar: React.FC = () => {
  const {
    searchQuery,
    setSearchQuery,
    hasGpsOnly,
    setHasGpsOnly,
    isFavoriteOnly,
    setIsFavoriteOnly,
    minRating,
    setMinRating,
    selectedAlbumId,
    setSelectedAlbumId,
    selectedTagId,
    setSelectedTagId,
    dateFrom,
    setDateRange,
    clearFilters,
    mediaTypeFilter,
  } = useLibraryStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Debounce search input by 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    hasGpsOnly ||
    isFavoriteOnly ||
    minRating > 0 ||
    selectedAlbumId !== null ||
    selectedTagId !== null ||
    dateFrom !== null ||
    mediaTypeFilter !== 'all';

  const handleDatePreset = (preset: 'all' | '30days' | 'this_year' | 'last_year') => {
    const now = Date.now();
    if (preset === 'all') {
      setDateRange(null, null);
    } else if (preset === '30days') {
      setDateRange(now - 30 * 86400000, now);
    } else if (preset === 'this_year') {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
      setDateRange(yearStart, now);
    } else if (preset === 'last_year') {
      const prevYear = new Date().getFullYear() - 1;
      const start = new Date(prevYear, 0, 1).getTime();
      const end = new Date(prevYear, 11, 31, 23, 59, 59).getTime();
      setDateRange(start, end);
    }
  };

  const handleCycleRating = () => {
    // Cycle: 0 (all) -> 3+ -> 4+ -> 5 -> 0
    if (minRating === 0) setMinRating(3);
    else if (minRating === 3) setMinRating(4);
    else if (minRating === 4) setMinRating(5);
    else setMinRating(0);
  };

  return (
    <div
      className="glass-panel"
      style={{
        height: 52,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--surface-glass-border)',
        zIndex: 40,
        gap: 16,
      }}
    >
      {/* Search Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 380, position: 'relative' }}>
        <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 12 }} />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search filenames, folders, camera models..."
          style={{
            width: '100%',
            padding: '7px 32px 7px 36px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--surface-glass-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        {localSearch && (
          <button
            onClick={() => {
              setLocalSearch('');
              setSearchQuery('');
            }}
            style={{
              position: 'absolute',
              right: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Date & Filter Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Active Album Badge */}
        {selectedAlbumId !== null && (
          <div
            style={{
              padding: '4px 8px 4px 10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              color: 'var(--accent-primary)',
              fontSize: '0.72rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Folder size={12} />
            <span>Album #{selectedAlbumId}</span>
            <button
              onClick={() => setSelectedAlbumId(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                padding: 1,
                display: 'flex',
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Active Tag Badge */}
        {selectedTagId !== null && (
          <div
            style={{
              padding: '4px 8px 4px 10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: 'var(--status-success)',
              fontSize: '0.72rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <TagIcon size={12} />
            <span>Tag #{selectedTagId}</span>
            <button
              onClick={() => setSelectedTagId(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--status-success)',
                cursor: 'pointer',
                padding: 1,
                display: 'flex',
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Date presets */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Calendar size={14} color="var(--text-muted)" style={{ marginRight: 2 }} />
          <button
            onClick={() => handleDatePreset('all')}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 600,
              backgroundColor: dateFrom === null ? 'var(--surface-glass-hover)' : 'transparent',
              color: dateFrom === null ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            All Time
          </button>
          <button
            onClick={() => handleDatePreset('30days')}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 600,
              backgroundColor: dateFrom !== null ? 'var(--surface-glass-hover)' : 'transparent',
              color: dateFrom !== null ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
          >
            Last 30d
          </button>
        </div>

        {/* Favorites Only Toggle */}
        <button
          onClick={() => setIsFavoriteOnly(!isFavoriteOnly)}
          title="Toggle favorites filter"
          style={{
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            border: isFavoriteOnly ? '1px solid #f87171' : '1px solid var(--surface-glass-border)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: 600,
            backgroundColor: isFavoriteOnly ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
            color: isFavoriteOnly ? '#f87171' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s ease',
          }}
        >
          <Heart size={13} fill={isFavoriteOnly ? '#f87171' : 'none'} />
          Favorites
        </button>

        {/* Minimum Star Rating Filter */}
        <button
          onClick={handleCycleRating}
          title="Filter by minimum star rating (click to cycle)"
          style={{
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            border: minRating > 0 ? '1px solid #fbbf24' : '1px solid var(--surface-glass-border)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: 600,
            backgroundColor: minRating > 0 ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
            color: minRating > 0 ? '#fbbf24' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s ease',
          }}
        >
          <Star size={13} fill={minRating > 0 ? '#fbbf24' : 'none'} />
          {minRating === 0 ? 'Rating: Any' : `${minRating}+ Stars`}
        </button>

        {/* GPS Toggle */}
        <button
          onClick={() => setHasGpsOnly(!hasGpsOnly)}
          style={{
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            border: hasGpsOnly ? '1px solid var(--accent-primary)' : '1px solid var(--surface-glass-border)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: 600,
            backgroundColor: hasGpsOnly ? 'var(--accent-primary)' : 'transparent',
            color: hasGpsOnly ? '#ffffff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s ease',
          }}
        >
          <MapPin size={13} />
          Geotagged
        </button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setLocalSearch('');
              clearFilters();
            }}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--status-danger)',
              background: 'rgba(239, 68, 68, 0.12)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RotateCcw size={12} />
            Reset
          </button>
        )}
      </div>
    </div>
  );
};

