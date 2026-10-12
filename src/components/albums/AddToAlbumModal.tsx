import React, { useEffect, useState } from 'react';
import { X, FolderPlus, Check, Folder } from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { Album, MediaItem } from '../../types/media';
import { useLibraryStore } from '../../stores/libraryStore';

interface AddToAlbumModalProps {
  item?: MediaItem;
  mediaIds?: number[];
  onClose: () => void;
}

export const AddToAlbumModal: React.FC<AddToAlbumModalProps> = ({ item, mediaIds, onClose }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [newAlbumName, setNewAlbumName] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [successAlbumId, setSuccessAlbumId] = useState<number | null>(null);

  const { incrementSyncRevision } = useLibraryStore();

  const targetIds = mediaIds && mediaIds.length > 0 ? mediaIds : item ? [item.id] : [];

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
  }, []);

  const handleAddToAlbum = async (albumId: number) => {
    if (targetIds.length === 0) return;
    setIsAdding(true);
    try {
      await tauriApi.batchAddMediaToAlbum(albumId, targetIds);
      setSuccessAlbumId(albumId);
      incrementSyncRevision();
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      console.error('Failed to add to album:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim() || targetIds.length === 0) return;

    setIsAdding(true);
    try {
      const album = await tauriApi.createAlbum(newAlbumName.trim());
      await tauriApi.batchAddMediaToAlbum(album.id, targetIds);
      setSuccessAlbumId(album.id);
      incrementSyncRevision();
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      console.error('Failed to create and add to album:', err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 160,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: 420,
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxHeight: '80vh',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Folder size={18} color="var(--accent-primary)" />
            Add to Album
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Adding: <strong style={{ color: 'var(--text-primary)' }}>{item ? item.file_name : `${targetIds.length} selected items`}</strong>
        </div>

        {/* Existing Albums List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220 }}>
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Loading albums...
            </div>
          ) : albums.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No albums yet. Create one below!
            </div>
          ) : (
            albums.map((album) => {
              const isAdded = successAlbumId === album.id;
              return (
                <button
                  key={album.id}
                  onClick={() => handleAddToAlbum(album.id)}
                  disabled={isAdding}
                  className="glass-panel"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: isAdded ? '1px solid var(--status-success)' : '1px solid var(--surface-glass-border)',
                    backgroundColor: isAdded ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{album.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{album.media_count} items</div>
                  </div>
                  {isAdded ? (
                    <Check size={16} color="var(--status-success)" />
                  ) : (
                    <FolderPlus size={16} color="var(--text-muted)" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Quick Create New Album */}
        <form onSubmit={handleCreateAndAdd} style={{ borderTop: '1px solid var(--surface-glass-border)', paddingTop: 14 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Or Create New Album
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="Album title..."
              style={{
                flex: 1,
                padding: '7px 10px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--surface-glass-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={!newAlbumName.trim() || isAdding}
              style={{ padding: '7px 12px', fontSize: '0.8rem' }}
            >
              Create & Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
