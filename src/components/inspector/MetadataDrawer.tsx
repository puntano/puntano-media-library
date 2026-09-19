import React, { useEffect } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';

export const MetadataDrawer: React.FC = () => {
  const { selectedItem, isInspectorOpen, setInspectorOpen, setSelectedItem, setActiveView } = useLibraryStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isInspectorOpen) {
        setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInspectorOpen, setInspectorOpen]);

  if (!isInspectorOpen || !selectedItem) return null;

  const handleClose = () => {
    setInspectorOpen(false);
    setSelectedItem(null);
  };

  const handleViewOnMap = () => {
    setActiveView('map');
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
          <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
            Media Inspector
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            ✕
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
              marginBottom: 24,
            }}
          >
            <img
              src={getThumbnailUrl(selectedItem.file_hash, selectedItem.media_type)}
              alt={selectedItem.file_name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
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

          {/* File Overview */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
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
            </div>
          </div>

          {/* Chronological Metadata */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
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
              <h4 style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
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
                <h4 style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                  }}
                >
                  View on Map ↗
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
    </>
  );
};
