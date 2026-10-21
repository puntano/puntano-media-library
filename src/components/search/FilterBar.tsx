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
  Trash2,
  Plus,
} from 'lucide-react';
import { useLibraryStore } from '../../stores/libraryStore';
import { tauriApi } from '../../services/tauriApi';
import { Album, Tag } from '../../types/media';

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

const formatDateInput = (ts: number | null): string => {
  if (ts === null) return '';
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
    dateTo,
    setDateRange,
    clearFilters,
    mediaTypeFilter,
    sortBy,
    sortOrder,
    setSort,
    toggleSortOrder,
    syncRevision,
    incrementSyncRevision,
  } = useLibraryStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [datePresetLabel, setDatePresetLabel] = useState<string | null>(null);

  const albumDropdownRef = useRef<HTMLDivElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
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

  // Reset preset label if date range is cleared externally
  useEffect(() => {
    if (dateFrom === null && dateTo === null) {
      setDatePresetLabel(null);
    }
  }, [dateFrom, dateTo]);

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
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setShowDateDropdown(false);
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
    dateTo !== null ||
    mediaTypeFilter !== 'all' ||
    sortBy !== 'date' ||
    sortOrder !== 'desc';

  const handleDatePreset = (preset: 'all' | '30days' | 'this_year' | 'last_year') => {
    const now = Date.now();
    if (preset === 'all') {
      setDateRange(null, null);
      setDatePresetLabel(null);
    } else if (preset === '30days') {
      setDateRange(now - 30 * 86400000, now);
      setDatePresetLabel('Last 30d');
    } else if (preset === 'this_year') {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
      setDateRange(yearStart, now);
      setDatePresetLabel('This Year');
    } else if (preset === 'last_year') {
      const prevYear = new Date().getFullYear() - 1;
      const start = new Date(prevYear, 0, 1).getTime();
      const end = new Date(prevYear, 11, 31, 23, 59, 59, 999).getTime();
      setDateRange(start, end);
      setDatePresetLabel(`${prevYear}`);
    }
    setShowDateDropdown(false);
  };

  const handleCustomDateChange = (field: 'from' | 'to', value: string) => {
    setDatePresetLabel(null);
    if (field === 'from') {
      const nextFrom = value ? new Date(`${value}T00:00:00`).getTime() : null;
      setDateRange(nextFrom, dateTo);
    } else {
      const nextTo = value ? new Date(`${value}T23:59:59.999`).getTime() : null;
      setDateRange(dateFrom, nextTo);
    }
  };

  const getActiveDateBadgeLabel = (): string => {
    if (datePresetLabel) return datePresetLabel;
    if (dateFrom !== null && dateTo !== null) {
      return `${formatDateInput(dateFrom)} → ${formatDateInput(dateTo)}`;
    }
    if (dateFrom !== null) {
      return `From ${formatDateInput(dateFrom)}`;
    }
    if (dateTo !== null) {
      return `Until ${formatDateInput(dateTo)}`;
    }
    return 'Dates';
  };

  const handleCreateTagInline = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    try {
      const created = await tauriApi.createTag(trimmed, newTagColor);
      setTags((prev) =>
        prev.some((t) => t.id === created.id)
          ? prev.map((t) => (t.id === created.id ? created : t))
          : [...prev, created]
      );
      setNewTagName('');
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
  };

  const handleDeleteTag = async (tagId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await tauriApi.deleteTag(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      if (selectedTagId === tagId) {
        setSelectedTagId(null);
      }
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to delete tag:', err);
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
                setShowDateDropdown(false);
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
                backgroundColor: `${activeTag?.color || '#10b981'}22`,
                border: `1px solid ${activeTag?.color || '#10b981'}55`,
                color: activeTag?.color || 'var(--status-success)',
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
                  color: activeTag?.color || 'var(--status-success)',
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
                setShowDateDropdown(false);
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
                width: 240,
                borderRadius: 'var(--radius-md)',
                padding: '8px',
                backgroundColor: 'var(--bg-secondary)',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--surface-glass-border)',
                zIndex: 60,
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '2px 6px 6px 6px', textTransform: 'uppercase' }}>
                Select or Manage Tags
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {tags.length === 0 ? (
                  <div style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    No tags found
                  </div>
                ) : (
                  tags.map((tag) => (
                    <div
                      key={tag.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 4,
                        paddingRight: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-glass-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <button
                        onClick={() => {
                          setSelectedTagId(tag.id);
                          setShowTagDropdown(false);
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: tag.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tag.name}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{tag.media_count}</span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteTag(tag.id, e)}
                        title={`Delete tag "${tag.name}" globally`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Create Tag Inline Form */}
              <form
                onSubmit={handleCreateTagInline}
                style={{
                  borderTop: '1px solid var(--surface-glass-border)',
                  marginTop: 6,
                  paddingTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="text"
                    placeholder="New tag name..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--surface-glass-border)',
                      color: '#ffffff',
                      fontSize: '0.75rem',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!newTagName.trim()}
                    className="btn-primary"
                    style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewTagColor(color)}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        backgroundColor: color,
                        border: newTagColor === color ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.2)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                      title={`Select color ${color}`}
                    />
                  ))}
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Date Filter Popover + Active Badge */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={dateDropdownRef}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: 'var(--radius-sm)',
              border:
                dateFrom !== null || dateTo !== null
                  ? '1px solid rgba(59, 130, 246, 0.45)'
                  : '1px solid var(--surface-glass-border)',
              backgroundColor:
                dateFrom !== null || dateTo !== null ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            }}
          >
            <button
              onClick={() => {
                setShowDateDropdown(!showDateDropdown);
                setShowAlbumDropdown(false);
                setShowTagDropdown(false);
                setShowSortDropdown(false);
              }}
              style={{
                padding: '5px 9px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: dateFrom !== null || dateTo !== null ? 'var(--accent-primary)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              title="Filter by capture date range"
            >
              <Calendar size={12} />
              <span>{getActiveDateBadgeLabel()}</span>
              <ChevronDown size={11} />
            </button>
            {(dateFrom !== null || dateTo !== null) && (
              <button
                onClick={() => handleDatePreset('all')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  padding: '0 6px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Clear date filter"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {showDateDropdown && (
            <div
              className="glass-panel"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 6,
                width: 240,
                borderRadius: 'var(--radius-md)',
                padding: '10px',
                backgroundColor: 'var(--bg-secondary)',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--surface-glass-border)',
                zIndex: 60,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Date Presets
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  onClick={() => handleDatePreset('all')}
                  className="btn-secondary"
                  style={{
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    justifyContent: 'center',
                    borderColor: dateFrom === null && dateTo === null ? 'var(--accent-primary)' : undefined,
                    color: dateFrom === null && dateTo === null ? 'var(--accent-primary)' : undefined,
                  }}
                >
                  All Time
                </button>
                <button
                  onClick={() => handleDatePreset('30days')}
                  className="btn-secondary"
                  style={{
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    justifyContent: 'center',
                    borderColor: datePresetLabel === 'Last 30d' ? 'var(--accent-primary)' : undefined,
                    color: datePresetLabel === 'Last 30d' ? 'var(--accent-primary)' : undefined,
                  }}
                >
                  Last 30 Days
                </button>
                <button
                  onClick={() => handleDatePreset('this_year')}
                  className="btn-secondary"
                  style={{
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    justifyContent: 'center',
                    borderColor: datePresetLabel === 'This Year' ? 'var(--accent-primary)' : undefined,
                    color: datePresetLabel === 'This Year' ? 'var(--accent-primary)' : undefined,
                  }}
                >
                  This Year
                </button>
                <button
                  onClick={() => handleDatePreset('last_year')}
                  className="btn-secondary"
                  style={{
                    padding: '5px 8px',
                    fontSize: '0.74rem',
                    justifyContent: 'center',
                    borderColor:
                      datePresetLabel === `${new Date().getFullYear() - 1}` ? 'var(--accent-primary)' : undefined,
                    color:
                      datePresetLabel === `${new Date().getFullYear() - 1}` ? 'var(--accent-primary)' : undefined,
                  }}
                >
                  Last Year ({new Date().getFullYear() - 1})
                </button>
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--surface-glass-border)',
                  paddingTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Custom Range
                </div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>From</span>
                  <input
                    type="date"
                    value={formatDateInput(dateFrom)}
                    onChange={(e) => handleCustomDateChange('from', e.target.value)}
                    style={{
                      padding: '3px 6px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--surface-glass-border)',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      outline: 'none',
                    }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>To</span>
                  <input
                    type="date"
                    value={formatDateInput(dateTo)}
                    onChange={(e) => handleCustomDateChange('to', e.target.value)}
                    style={{
                      padding: '3px 6px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--surface-glass-border)',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      outline: 'none',
                    }}
                  />
                </label>
              </div>
            </div>
          )}
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
              setShowDateDropdown(false);
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
