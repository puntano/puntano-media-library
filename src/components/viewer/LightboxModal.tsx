import React, { useEffect, useState, useRef } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';

export const LightboxModal: React.FC = () => {
  const {
    lightboxIndex,
    lightboxItems,
    closeLightbox,
    nextLightboxItem,
    prevLightboxItem,
    setSelectedItem,
  } = useLibraryStore();

  const [zoom, setZoom] = useState<number>(1);
  const [isPlayingVideo, setIsPlayingVideo] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeItem = lightboxIndex !== null ? lightboxItems[lightboxIndex] : null;

  // Reset zoom on item change
  useEffect(() => {
    setZoom(1);
    setIsPlayingVideo(false);
  }, [lightboxIndex]);

  // Keyboard Navigation
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowRight') {
        nextLightboxItem();
      } else if (e.key === 'ArrowLeft') {
        prevLightboxItem();
      } else if (e.key === ' ' && activeItem?.media_type === 'video') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlayingVideo(true);
          } else {
            videoRef.current.pause();
            setIsPlayingVideo(false);
          }
        }
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z + 0.25, 4));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((z) => Math.max(z - 0.25, 0.5));
      } else if (e.key === '0') {
        setZoom(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, closeLightbox, nextLightboxItem, prevLightboxItem, activeItem]);

  if (!activeItem || lightboxIndex === null) return null;

  const isFirst = lightboxIndex === 0;
  const isLast = lightboxIndex === lightboxItems.length - 1;

  const handleInspect = () => {
    setSelectedItem(activeItem);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        zIndex: 150,
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* Top Floating Control Bar */}
      <header
        style={{
          height: 60,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={closeLightbox}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
          >
            ← Back (Esc)
          </button>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#ffffff' }}>
              {activeItem.file_name}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{lightboxIndex + 1} of {lightboxItems.length}</span>
              <span>•</span>
              <span>{(activeItem.file_size / (1024 * 1024)).toFixed(2)} MB</span>
              {activeItem.captured_at && (
                <>
                  <span>•</span>
                  <span>{new Date(activeItem.captured_at).toLocaleDateString()}</span>
                </>
              )}
              {activeItem.media_type === 'video' && (
                <>
                  <span>•</span>
                  <span style={{ color: isPlayingVideo ? 'var(--status-success)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {isPlayingVideo ? '▶ Playing' : '⏸ Paused (Space)'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Zoom & Inspect Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeItem.media_type === 'photo' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--surface-glass-border)',
                padding: '2px 4px',
              }}
            >
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 8px', cursor: 'pointer' }}
                title="Zoom out (-)"
              >
                −
              </button>
              <span style={{ fontSize: '0.75rem', padding: '0 6px', color: 'var(--text-secondary)' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
                style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 8px', cursor: 'pointer' }}
                title="Zoom in (+)"
              >
                +
              </button>
              {zoom !== 1 && (
                <button
                  onClick={() => setZoom(1)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.72rem', padding: '4px 6px', cursor: 'pointer' }}
                >
                  Reset
                </button>
              )}
            </div>
          )}

          <button className="btn-secondary" onClick={handleInspect} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            ℹ️ Metadata
          </button>
          <button
            onClick={closeLightbox}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            ✕
          </button>
        </div>
      </header>

      {/* Main Centered Media Stage */}
      <main
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: 24,
        }}
      >
        {/* Navigation Arrows */}
        {!isFirst && (
          <button
            onClick={prevLightboxItem}
            className="glass-panel"
            style={{
              position: 'absolute',
              left: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1.25rem',
              cursor: 'pointer',
              border: '1px solid var(--surface-glass-border)',
              zIndex: 20,
              transition: 'all 0.2s ease',
            }}
          >
            ‹
          </button>
        )}

        {!isLast && (
          <button
            onClick={nextLightboxItem}
            className="glass-panel"
            style={{
              position: 'absolute',
              right: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1.25rem',
              cursor: 'pointer',
              border: '1px solid var(--surface-glass-border)',
              zIndex: 20,
              transition: 'all 0.2s ease',
            }}
          >
            ›
          </button>
        )}

        {/* Media Container */}
        <div
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s ease-out',
            transform: `scale(${zoom})`,
          }}
        >
          {activeItem.media_type === 'video' ? (
            <video
              ref={videoRef}
              src={`asset://localhost/${activeItem.file_path}`}
              poster={getThumbnailUrl(activeItem.file_hash, 'video')}
              controls
              autoPlay
              style={{
                maxWidth: '85vw',
                maxHeight: '80vh',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
              }}
              onPlay={() => setIsPlayingVideo(true)}
              onPause={() => setIsPlayingVideo(false)}
            />
          ) : (
            <img
              src={getThumbnailUrl(activeItem.file_hash, 'photo')}
              alt={activeItem.file_name}
              style={{
                maxWidth: '85vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: 'var(--radius-sm)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
};
