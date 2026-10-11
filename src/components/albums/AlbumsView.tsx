import React, { useEffect, useState } from 'react';
import { FolderHeart, Plus, Trash2, Calendar, Image as ImageIcon, X } from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { Album } from '../../types/media';
import { MediaThumbnail } from '../common/MediaThumbnail';
import { useLibraryStore } from '../../stores/libraryStore';

export const AlbumsView: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newAlbumName, setNewAlbumName] = useState<string>('');
  const [newAlbumDesc, setNewAlbumDesc] = useState<string>('');

  const { setSelectedAlbumId, setActiveView, syncRevision } = useLibraryStore();

  const loadAlbums = async () => {
    setIsLoading(true);
    try {
      const data = await tauriApi.getAlbums();
      setAlbums(data);
    } catch (err) {
      console.error('Failed to load albums:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, [syncRevision]);

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;

    try {
      await tauriApi.createAlbum(newAlbumName.trim(), newAlbumDesc.trim() || undefined);
      setNewAlbumName('');
      setNewAlbumDesc('');
      setShowCreateModal(false);
      await loadAlbums();
    } catch (err) {
      console.error('Failed to create album:', err);
    }
  };

  const handleDeleteAlbum = async (e: React.MouseEvent, album: Album) => {
    e.stopPropagation();
    if (
      !confirm(
        `Are you sure you want to delete the album "${album.name}"?\n\nThis will only delete the album collection. Your photos on disk will NOT be touched.`
      )
    ) {
      return;
    }

    try {
      await tauriApi.deleteAlbum(album.id);
      await loadAlbums();
    } catch (err) {
      console.error('Failed to delete album:', err);
    }
  };

  const handleOpenAlbum = (album: Album) => {
    setSelectedAlbumId(album.id);
    setActiveView('gallery');
  };

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: '28px 32px' }}>
      {/* View Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
          paddingBottom: 16,
          borderBottom: '1px solid var(--surface-glass-border)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderHeart size={26} color="var(--accent-primary)" />
            Albums & Collections
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: 4, marginBottom: 0 }}>
            Organize and curate your media into custom collections and projects
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} />
          Create Album
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading albums...
        </div>
      ) : albums.length === 0 ? (
        <div
          style={{
            height: '60vh',
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
            <FolderHeart size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>No Albums Created Yet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4, maxWidth: 380 }}>
              Group your favorite memories, portfolio shots, or vacation videos into custom albums.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
          >
            <Plus size={16} />
            Create Your First Album
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          {albums.map((album) => (
            <div
              key={album.id}
              onClick={() => handleOpenAlbum(album)}
              className="glass-panel"
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              {/* Cover Thumbnail Area */}
              <div
                style={{
                  width: '100%',
                  height: 170,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {album.cover_file_path && album.cover_file_hash ? (
                  <MediaThumbnail
                    filePath={album.cover_file_path}
                    fileHash={album.cover_file_hash}
                    mediaType="photo"
                    alt={album.name}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                    <ImageIcon size={32} opacity={0.4} />
                    <span style={{ fontSize: '0.75rem' }}>Empty Album</span>
                  </div>
                )}

                {/* Media Count Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    padding: '3px 8px',
                    borderRadius: 12,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: '#ffffff',
                  }}
                >
                  {album.media_count} {album.media_count === 1 ? 'item' : 'items'}
                </div>
              </div>

              {/* Album Details */}
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {album.name}
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={(e) => handleDeleteAlbum(e, album)}
                    title="Delete album"
                    style={{
                      padding: 4,
                      color: 'var(--text-muted)',
                      border: 'none',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--status-danger)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {album.description && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {album.description}
                  </div>
                )}

                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={11} />
                  Created {new Date(album.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Album Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 130,
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: 440,
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>Create New Album</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAlbum} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Album Name *
                </label>
                <input
                  type="text"
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  placeholder="e.g. Summer Vacation 2026"
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--surface-glass-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Description (optional)
                </label>
                <textarea
                  value={newAlbumDesc}
                  onChange={(e) => setNewAlbumDesc(e.target.value)}
                  placeholder="e.g. Best photos from our road trip..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--surface-glass-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!newAlbumName.trim()}
                >
                  Create Album
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
