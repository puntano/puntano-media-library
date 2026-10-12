import React, { useEffect, useState, useRef } from 'react';
import {
  Search,
  MapPin,
  X,
  RotateCcw,
  Calendar,
  Heart,
  Star,
  Folder,
  Tag as TagIcon,
  ArrowUp,
  ArrowDown,
  ChevronDown,
} from 'lucide-react';
import { useLibraryStore } from '../../stores/libraryStore';
import { tauriApi } from '../../services/tauriApi';
import { Album, Tag } from '../../types/media';

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
    sortBy,
    sortOrder,
    setSort,
    toggleSortOrder,
    syncRevision,
  } = useLibraryStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const albumDropdownRef = useRef<HTMLDivElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search input by 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery]);

  // Sync external search query changes to localSearch
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Load albums and tags for filter dropdowns and label resolution
  useEffect(() => {
    tauriApi.getAlbums().then(setAlbums).catch(console.error);
    tauriApi.getTags().then(setTags).catch(console.error);
  }, [syncRevision]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (albumDropdownRef.current && !albumDropdownRef.current.contains(e.target as Node)) {
        setShowAlbumDropdown(false);
      }
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeAlbum = albums.find((a) => a.id === selectedAlbumId);
  const activeTag = tags.find((t) => t.id === selectedTagId);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    hasGpsOnly ||
    isFavoriteOnly ||
    minRating > 0 ||
    selectedAlbumId !== null ||
    selectedTagId !== null ||
    dateFrom !== null ||
    mediaTypeFilter !== 'all' ||
    sortBy !== 'date' ||
    sortOrder !== 'desc';

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

  const sortLabels: Record<string, string> = {
    date: 'Date',
    name: 'Name',
    size: 'Size',
    rating: 'Rating',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 340, position: 'relative' }}>
        <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 12 }} />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search filenames, cameras, folders..."
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

      {/* Filter Badges & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Active Album Badge or Album Selector Dropdown */}
        <div style={{ position: 'relative' }} ref={albumDropdownRef}>
          {selectedAlbumId !== null ? (
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
              <span>{activeAlbum ? activeAlbum.name : `Album #${selectedAlbumId}`}</span>
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
                title="Clear album filter"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowAlbumDropdown(!showAlbumDropdown);
                setShowTagDropdown(false);
                setShowSortDropdown(false);
              }}
              className="btn-secondary"
              style={{ padding: '5px 9px', fontSize: '0.72rem', gap: 4 }}
              title="Filter by album"
            >
              <Folder size={12} />
              Albums
              <ChevronDown size={11} />
            </button>
          )}

          {/* Album Dropdown Popover */}
          {showAlbumDropdown && (
            <div
              className="glass-panel"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 6,
                width: 220,
                borderRadius: 'var(--radius-md)',
                padding: '6px',
                backgroundColor: 'var(--bg-secondary)',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--surface-glass-border)',
                zIndex: 60,
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase' }}>
                Select Album
              </div>
              {albums.length === 0 ? (
                <div style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  No albums found
                </div>
              ) : (
                albums.map((album) => (
                  <button
                    key={album.id}
                    onClick={() => {
                      setSelectedAlbumId(album.id);
                      setShowAlbumDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 4,
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-glass-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {album.name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{album.media_count}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Active Tag Badge or Tag Selector Dropdown */}
        <div style={{ position: 'relative' }} ref={tagDropdownRef}>
          {selectedTagId !== null ? (
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
              <span>{activeTag ? activeTag.name : `Tag #${selectedTagId}`}</span>
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
                title="Clear tag filter"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowTagDropdown(!showTagDropdown);
                setShowAlbumDropdown(false);
                setShowSortDropdown(false);
              }}
              className="btn-secondary"
              style={{ padding: '5px 9px', fontSize: '0.72rem', gap: 4 }}
              title="Filter by tag"
            >
              <TagIcon size={12} />
              Tags
              <ChevronDown size={11} />
            </button>
          )}

          {/* Tag Dropdown Popover */}
          {showTagDropdown && (
            <div
              className="glass-panel"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 6,
                width: 200,
                borderRadius: 'var(--radius-md)',
                padding: '6px',
                backgroundColor: 'var(--bg-secondary)',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--surface-glass-border)',
                zIndex: 60,
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase' }}>
                Select Tag
              </div>
              {tags.length === 0 ? (
                <div style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  No tags found
                </div>
              ) : (
                tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setSelectedTagId(tag.id);
                      setShowTagDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 4,
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-glass-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: tag.color }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tag.name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{tag.media_count}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Date presets */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <Calendar size={13} color="var(--text-muted)" style={{ marginRight: 2 }} />
          <button
            onClick={() => handleDatePreset('all')}
            style={{
              padding: '4px 7px',
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
              padding: '4px 7px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 600,
              backgroundColor: dateFrom !== null ? 'var(--surface-glass-hover)' : 'transparent',
              color: dateFrom !== null ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
          >
            30d
          </button>
        </div>

        {/* Favorites Only Toggle */}
        <button
          onClick={() => setIsFavoriteOnly(!isFavoriteOnly)}
          title="Toggle favorites filter"
          style={{
            padding: '5px 9px',
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
          Favs
        </button>

        {/* Minimum Star Rating Filter */}
        <button
          onClick={handleCycleRating}
          title="Filter by minimum star rating (click to cycle)"
          style={{
            padding: '5px 9px',
            borderRadius: 'var(--radius-sm)',
            border: minRating > 0 ? '1px solid #fbbf24' : '1px solid var(--surface-glass-border)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: 600,
            backgroundColor: minRating > 0 ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
            color: minRating > 0 ? '#fbbf24' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s ease',
          }}
        >
          <Star size={13} fill={minRating > 0 ? '#fbbf24' : 'none'} />
          {minRating === 0 ? 'Stars' : `${minRating}+`}
        </button>

        {/* GPS Toggle */}
        <button
          onClick={() => setHasGpsOnly(!hasGpsOnly)}
          style={{
            padding: '5px 9px',
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
          <MapPin size={13} />
          GPS
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: 'var(--surface-glass-border)' }} />

        {/* Multi-Criteria Sort Dropdown */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={sortDropdownRef}>
          <button
            onClick={() => {
              setShowSortDropdown(!showSortDropdown);
              setShowAlbumDropdown(false);
              setShowTagDropdown(false);
            }}
            className="btn-secondary"
            style={{
              padding: '5px 8px',
              fontSize: '0.72rem',
              gap: 4,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            }}
            title="Choose sort attribute"
          >
            <span>Sort: {sortLabels[sortBy]}</span>
            <ChevronDown size={11} />
          </button>
          <button
            onClick={toggleSortOrder}
            className="btn-secondary"
            style={{
              padding: '5px 6px',
              fontSize: '0.72rem',
              borderLeft: 'none',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
            }}
            title={`Current order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}. Click to toggle.`}
          >
            {sortOrder === 'asc' ? <ArrowUp size={12} color="var(--accent-primary)" /> : <ArrowDown size={12} color="var(--accent-primary)" />}
          </button>

          {showSortDropdown && (
            <div
              className="glass-panel"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                width: 140,
                borderRadius: 'var(--radius-md)',
                padding: '6px',
                backgroundColor: 'var(--bg-secondary)',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--surface-glass-border)',
                zIndex: 60,
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase' }}>
                Sort By
              </div>
              {(['date', 'name', 'size', 'rating'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setSort(mode);
                    setShowSortDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 4,
                    background: sortBy === mode ? 'var(--surface-glass-hover)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    color: sortBy === mode ? 'var(--accent-primary)' : '#ffffff',
                    fontWeight: sortBy === mode ? 700 : 400,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  {sortLabels[mode]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear / Reset Filters */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setLocalSearch('');
              clearFilters();
            }}
            style={{
              padding: '5px 8px',
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
            title="Reset all filters and sorting"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        )}
      </div>
    </div>
  );
};
