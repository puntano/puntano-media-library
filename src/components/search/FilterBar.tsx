import React, { useEffect, useState } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';

export const FilterBar: React.FC = () => {
  const {
    searchQuery,
    setSearchQuery,
    hasGpsOnly,
    setHasGpsOnly,
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
    searchQuery.trim().length > 0 || hasGpsOnly || dateFrom !== null || mediaTypeFilter !== 'all';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 420 }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>🔍</span>
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search filenames, folders, camera models..."
          style={{
            width: '100%',
            padding: '6px 12px',
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
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Date & Filter Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Date presets */}
        <div style={{ display: 'flex', gap: 4 }}>
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

        {/* GPS Toggle */}
        <button
          onClick={() => setHasGpsOnly(!hasGpsOnly)}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            border: hasGpsOnly ? '1px solid var(--accent-primary)' : '1px solid var(--surface-glass-border)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: 600,
            backgroundColor: hasGpsOnly ? 'var(--accent-primary)' : 'transparent',
            color: hasGpsOnly ? '#ffffff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s ease',
          }}
        >
          <span>📍</span> Geotagged Only
        </button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setLocalSearch('');
              clearFilters();
            }}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--status-danger)',
              background: 'rgba(239, 68, 68, 0.1)',
            }}
          >
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
};
