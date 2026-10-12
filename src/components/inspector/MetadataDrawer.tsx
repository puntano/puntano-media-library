import React, { useEffect, useState } from 'react';
import {
  X,
  FolderOpen,
  Calendar,
  Camera,
  MapPin,
  HardDrive,
  ExternalLink,
  Info,
  Heart,
  Star,
  FolderPlus,
  Tag as TagIcon,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useLibraryStore } from '../../stores/libraryStore';
import { tauriApi } from '../../services/tauriApi';
import { Tag } from '../../types/media';
import { MediaThumbnail } from '../common/MediaThumbnail';
import { AddToAlbumModal } from '../albums/AddToAlbumModal';

export const MetadataDrawer: React.FC = () => {
  const {
    selectedItem,
    isInspectorOpen,
    setInspectorOpen,
    setSelectedItem,
    setActiveView,
    incrementSyncRevision,
  } = useLibraryStore();

  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [showAddToAlbum, setShowAddToAlbum] = useState<boolean>(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [isAddingTag, setIsAddingTag] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isInspectorOpen) {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          setInspectorOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInspectorOpen, setInspectorOpen, showDeleteConfirm]);

  // Load tags for current item
  useEffect(() => {
    if (selectedItem?.id) {
      tauriApi
        .getMediaTags(selectedItem.id)
        .then(setTags)
        .catch((err) => console.error('Failed to load item tags:', err));
    } else {
      setTags([]);
    }
  }, [selectedItem?.id]);

  if (!isInspectorOpen || !selectedItem) return null;

  const handleClose = () => {
    setInspectorOpen(false);
    setSelectedItem(null);
  };

  const handleViewOnMap = () => {
    setActiveView('map');
  };

  const handleRevealInExplorer = () => {
    if (selectedItem?.file_path) {
      tauriApi.showInFolder(selectedItem.file_path);
    }
  };

  const handleCopyPath = async () => {
    if (!selectedItem?.file_path) return;
    try {
      await navigator.clipboard.writeText(selectedItem.file_path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('Failed to copy file path:', err);
    }
  };

  const handleDeleteFile = async (deleteFromDisk: boolean) => {
    if (!selectedItem?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await tauriApi.deleteMediaFile(selectedItem.id, deleteFromDisk);
      setShowDeleteConfirm(false);
      handleClose();
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to delete file:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleFavorite = async () => {
    const nextFavorite = !selectedItem.is_favorite;
    setSelectedItem({ ...selectedItem, is_favorite: nextFavorite });
    try {
      await tauriApi.setMediaFavorite(selectedItem.id, nextFavorite);
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      setSelectedItem({ ...selectedItem, is_favorite: selectedItem.is_favorite });
    }
  };

  const handleSetRating = async (ratingVal: number) => {
    const newRating = selectedItem.rating === ratingVal ? 0 : ratingVal;
    setSelectedItem({ ...selectedItem, rating: newRating });
    try {
      await tauriApi.setMediaRating(selectedItem.id, newRating);
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to set rating:', err);
      setSelectedItem({ ...selectedItem, rating: selectedItem.rating });
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const tagName = newTagInput.trim();
    if (!tagName || isAddingTag) return;

    setIsAddingTag(true);
    try {
      const tag = await tauriApi.createTag(tagName);
      await tauriApi.addTagToMedia(selectedItem.id, tag.id);
      setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      setNewTagInput('');
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to add tag:', err);
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    try {
      await tauriApi.removeTagFromMedia(selectedItem.id, tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  return (
    <>
      <div className="metadata-drawer-backdrop" onClick={handleClose} />

      <aside className="metadata-drawer">
        {/* Header */}
        <div
          style={{
            height: 64,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--surface-glass-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
            <Info size={18} color="var(--accent-primary)" />
            Media Inspector
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Media Preview Thumbnail */}
          <div
            className="glass-panel"
            style={{
              width: '100%',
              height: 220,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              marginBottom: 18,
            }}
          >
            {selectedItem.media_type === 'video' ? (
              <video
                src={`${convertFileSrc(selectedItem.file_path)}#t=0.5`}
                controls
                preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <MediaThumbnail
                filePath={selectedItem.file_path}
                fileHash={selectedItem.file_hash}
                mediaType={selectedItem.media_type}
                alt={selectedItem.file_name}
                style={{ objectFit: 'contain' }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                padding: '3px 8px',
                borderRadius: 4,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#ffffff',
              }}
            >
              {selectedItem.media_type.toUpperCase()}
            </div>
          </div>

          {/* Quick Curation & Organization Panel */}
          <div
            className="glass-panel"
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            {/* Top row: Favorite & Add to Album */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleToggleFavorite}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: selectedItem.is_favorite ? '1px solid #f87171' : '1px solid var(--surface-glass-border)',
                  backgroundColor: selectedItem.is_favorite ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-secondary)',
                  color: selectedItem.is_favorite ? '#f87171' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Heart size={15} fill={selectedItem.is_favorite ? '#f87171' : 'none'} />
                {selectedItem.is_favorite ? 'Favorited' : 'Favorite'}
              </button>

              <button
                onClick={() => setShowAddToAlbum(true)}
                className="btn-secondary"
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: '0.8rem',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                <FolderPlus size={15} color="var(--accent-primary)" />
                Add to Album
              </button>
            </div>

            {/* Middle row: 5-Star Rating */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Star Rating
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const activeRating = hoverRating !== null ? hoverRating : selectedItem.rating;
                  const isFilled = star <= activeRating;
                  return (
                    <button
                      key={star}
                      onClick={() => handleSetRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isFilled ? '#fbbf24' : 'var(--text-muted)',
                        transition: 'transform 0.1s ease',
                      }}
                    >
                      <Star size={18} fill={isFilled ? '#fbbf24' : 'none'} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom: Tags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TagIcon size={12} />
                  Tags & Labels
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {tags.length} tags
                </span>
              </div>

              {/* Tag Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 12,
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: 'var(--accent-primary)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                    }}
                  >
                    #{tag.name}
                    <button
                      onClick={() => handleRemoveTag(tag.id)}
                      title="Remove tag"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                      }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add Tag Input */}
              <form onSubmit={handleAddTag} style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="Add a new tag..."
                  style={{
                    flex: 1,
                    padding: '5px 10px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--surface-glass-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!newTagInput.trim() || isAddingTag}
                  className="btn-primary"
                  style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                >
                  <Plus size={13} />
                </button>
              </form>
            </div>
          </div>

          {/* File Overview */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              <HardDrive size={13} />
              File Information
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Name</span>
                <span style={{ fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedItem.file_name}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Size</span>
                <span>{(selectedItem.file_size / (1024 * 1024)).toFixed(2)} MB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Type</span>
                <span>{selectedItem.mime_type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Path</span>
                <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {selectedItem.file_path}
                </span>
              </div>

              {/* File Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <button
                  className="btn-secondary"
                  onClick={handleRevealInExplorer}
                  style={{
                    fontSize: '0.75rem',
                    padding: '6px 10px',
                    gap: 6,
                    justifyContent: 'center',
                  }}
                  title="Reveal in native OS file explorer"
                >
                  <FolderOpen size={14} />
                  Reveal
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleCopyPath}
                  style={{
                    fontSize: '0.75rem',
                    padding: '6px 10px',
                    gap: 6,
                    justifyContent: 'center',
                    color: copiedPath ? 'var(--status-success)' : undefined,
                  }}
                  title="Copy full absolute file path to clipboard"
                >
                  {copiedPath ? <Check size={14} /> : <Copy size={14} />}
                  {copiedPath ? 'Copied!' : 'Copy Path'}
                </button>
              </div>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: '7px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#ef4444',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.18)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)')}
              >
                <Trash2 size={13} />
                Delete File
              </button>
            </div>
          </div>

          {/* Chronological Metadata */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              <Calendar size={13} />
              Capture Time
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Captured Date</span>
                <span>
                  {selectedItem.captured_at
                    ? new Date(selectedItem.captured_at).toLocaleDateString(undefined, { dateStyle: 'long' })
                    : 'Unknown'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Captured Time</span>
                <span>
                  {selectedItem.captured_at
                    ? new Date(selectedItem.captured_at).toLocaleTimeString(undefined, { timeStyle: 'medium' })
                    : 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* Camera & Lens EXIF */}
          {(selectedItem.camera_make || selectedItem.camera_model || selectedItem.iso) && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                <Camera size={13} />
                Camera & Lens
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
                {selectedItem.camera_model && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Camera</span>
                    <span style={{ fontWeight: 600 }}>
                      {selectedItem.camera_make ? `${selectedItem.camera_make} ` : ''}
                      {selectedItem.camera_model}
                    </span>
                  </div>
                )}
                {selectedItem.lens_model && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Lens</span>
                    <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedItem.lens_model}
                    </span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                  {selectedItem.focal_length && (
                    <div className="glass-panel" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Focal</div>
                      <div style={{ fontWeight: 700 }}>{selectedItem.focal_length}mm</div>
                    </div>
                  )}
                  {selectedItem.aperture && (
                    <div className="glass-panel" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Aperture</div>
                      <div style={{ fontWeight: 700 }}>ƒ/{selectedItem.aperture}</div>
                    </div>
                  )}
                  {selectedItem.iso && (
                    <div className="glass-panel" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ISO</div>
                      <div style={{ fontWeight: 700 }}>{selectedItem.iso}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Geolocation Details */}
          {selectedItem.latitude && selectedItem.longitude && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <MapPin size={13} />
                  GPS Coordinates
                </h4>
                <button
                  onClick={handleViewOnMap}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <ExternalLink size={12} />
                  View on Map
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Latitude</span>
                  <span>{selectedItem.latitude.toFixed(6)}°</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Longitude</span>
                  <span>{selectedItem.longitude.toFixed(6)}°</span>
                </div>
                {selectedItem.altitude && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Altitude</span>
                    <span>{selectedItem.altitude.toFixed(1)} m</span>
                  </div>
                )}
                {selectedItem.geohash && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Geohash</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedItem.geohash}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Add To Album Modal */}
      {showAddToAlbum && (
        <AddToAlbumModal
          item={selectedItem}
          onClose={() => setShowAddToAlbum(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              border: '1px solid rgba(239, 68, 68, 0.3)',
              backgroundColor: 'var(--bg-primary)',
              boxShadow: 'var(--shadow-xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444', marginBottom: 12 }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Delete Media Item</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              How would you like to delete <strong style={{ color: '#ffffff' }}>{selectedItem.file_name}</strong>?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-secondary"
                disabled={isDeleting}
                onClick={() => handleDeleteFile(false)}
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
                  Keeps the physical file safe on disk, removing it from Puntano's index.
                </div>
              </button>

              <button
                disabled={isDeleting}
                onClick={() => handleDeleteFile(true)}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  textAlign: 'left',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)')}
                onMouseLeave={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)')}
              >
                <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trash2 size={13} />
                  Permanently Delete from Disk
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(239, 68, 68, 0.8)' }}>
                  Warning: Permanently removes the file from your filesystem storage. Cannot be undone.
                </div>
              </button>

              <button
                className="btn-secondary"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                style={{ marginTop: 6, justifyContent: 'center' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

