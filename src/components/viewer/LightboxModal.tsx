import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Heart,
  Star,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useLibraryStore } from '../../stores/libraryStore';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';
import { tauriApi, isTauri } from '../../services/tauriApi';

export const LightboxModal: React.FC = () => {
  const {
    lightboxIndex,
    lightboxItems,
    openLightbox,
    closeLightbox,
    nextLightboxItem,
    prevLightboxItem,
    setSelectedItem,
    incrementSyncRevision,
    setTotalMediaCount,
  } = useLibraryStore();

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const [rotation, setRotation] = useState<number>(0);
  const [isPlayingVideo, setIsPlayingVideo] = useState<boolean>(false);
  const [isFullResLoaded, setIsFullResLoaded] = useState<boolean>(false);
  const [isSlideshowActive, setIsSlideshowActive] = useState<boolean>(false);
  const [slideshowIntervalSec, setSlideshowIntervalSec] = useState<number>(4);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [rating, setRating] = useState<number>(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeItem = lightboxIndex !== null ? lightboxItems[lightboxIndex] : null;
  const isPhotoOrRaw = activeItem?.media_type === 'photo' || activeItem?.media_type === 'raw';

  // Reset zoom, pan, loading, and initialize rotation/curation state on item change
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    setIsPlayingVideo(false);
    setIsFullResLoaded(false);
    setShowDeleteConfirm(false);
    setIsFavorite(activeItem?.is_favorite ?? false);
    setRating(activeItem?.rating ?? 0);
    const o = activeItem?.orientation ?? 1;
    const initialDeg =
      o === 6 || o === 90 ? 90 :
      o === 3 || o === 180 ? 180 :
      o === 8 || o === 270 ? 270 : 0;
    setRotation(initialDeg);
  }, [lightboxIndex, activeItem]);

  // Stop slideshow when lightbox closes
  useEffect(() => {
    if (lightboxIndex === null) {
      setIsSlideshowActive(false);
    }
  }, [lightboxIndex]);

  // Advance to next item (wrapping around to start when in slideshow)
  const advanceSlideshowItem = useCallback(() => {
    if (lightboxIndex === null || lightboxItems.length === 0) return;
    if (lightboxIndex < lightboxItems.length - 1) {
      nextLightboxItem();
    } else {
      openLightbox(lightboxItems, 0);
    }
  }, [lightboxIndex, lightboxItems, nextLightboxItem, openLightbox]);

  // Slideshow timer for photos & RAW items (videos advance onEnded)
  useEffect(() => {
    if (!isSlideshowActive || lightboxIndex === null || lightboxItems.length <= 1) return;
    if (activeItem?.media_type === 'video') return;

    const timer = setInterval(() => {
      advanceSlideshowItem();
    }, slideshowIntervalSec * 1000);

    return () => clearInterval(timer);
  }, [isSlideshowActive, slideshowIntervalSec, lightboxIndex, lightboxItems.length, activeItem?.media_type, advanceSlideshowItem]);

  const handleRotateCw = useCallback(async () => {
    if (!activeItem || !isPhotoOrRaw) return;
    const nextDeg = (rotation + 90) % 360;
    setRotation(nextDeg);
    const exifOrientation =
      nextDeg === 90 ? 6 :
      nextDeg === 180 ? 3 :
      nextDeg === 270 ? 8 : 1;
    activeItem.orientation = exifOrientation;
    try {
      await tauriApi.setMediaOrientation(activeItem.id, exifOrientation);
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to save media orientation:', err);
    }
  }, [activeItem, isPhotoOrRaw, rotation, incrementSyncRevision]);

  const handleToggleFavorite = useCallback(async () => {
    if (!activeItem) return;
    const nextFav = !isFavorite;
    setIsFavorite(nextFav);
    activeItem.is_favorite = nextFav;
    try {
      await tauriApi.setMediaFavorite(activeItem.id, nextFav);
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to toggle favorite in lightbox:', err);
      setIsFavorite(!nextFav);
      activeItem.is_favorite = !nextFav;
    }
  }, [activeItem, isFavorite, incrementSyncRevision]);

  const handleSetRating = useCallback(
    async (star: number) => {
      if (!activeItem) return;
      const nextRating = rating === star ? 0 : star;
      setRating(nextRating);
      activeItem.rating = nextRating;
      try {
        await tauriApi.setMediaRating(activeItem.id, nextRating);
        incrementSyncRevision();
      } catch (err) {
        console.error('Failed to set rating in lightbox:', err);
      }
    },
    [activeItem, rating, incrementSyncRevision]
  );

  const handleDeleteCurrentItem = async (deleteFromDisk: boolean) => {
    if (!activeItem || lightboxIndex === null || isDeleting) return;
    setIsDeleting(true);
    try {
      await tauriApi.deleteMediaFile(activeItem.id, deleteFromDisk);
      setShowDeleteConfirm(false);
      incrementSyncRevision();
      tauriApi.getTotalMediaCount().then(setTotalMediaCount).catch(() => {});

      const remaining = lightboxItems.filter((item) => item.id !== activeItem.id);
      if (remaining.length === 0) {
        closeLightbox();
      } else {
        const nextIdx = Math.min(lightboxIndex, remaining.length - 1);
        openLightbox(remaining, nextIdx);
      }
    } catch (err) {
      console.error('Failed to delete item from lightbox:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Next & previous media prefetching for zero-latency transitions
  useEffect(() => {
    if (lightboxIndex === null || lightboxItems.length === 0) return;

    const indicesToPrefetch = [lightboxIndex - 1, lightboxIndex + 1];
    for (const idx of indicesToPrefetch) {
      if (idx >= 0 && idx < lightboxItems.length) {
        const item = lightboxItems[idx];
        if (item && (item.media_type === 'photo' || item.media_type === 'raw')) {
          const img = new Image();
          img.src =
            isTauri() && item.media_type === 'photo'
              ? convertFileSrc(item.file_path)
              : getThumbnailUrl(item.file_hash, item.media_type);
        }
      }
    }
  }, [lightboxIndex, lightboxItems]);

  // Keyboard Navigation & Curation Shortcuts
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          closeLightbox();
        }
      } else if (e.key === 'ArrowRight') {
        nextLightboxItem();
      } else if (e.key === 'ArrowLeft') {
        prevLightboxItem();
      } else if ((e.key === 'r' || e.key === 'R') && isPhotoOrRaw) {
        handleRotateCw();
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleFavorite();
      } else if (e.key === 's' || e.key === 'S') {
        setIsSlideshowActive((prev) => !prev);
      } else if (e.key === 'i' || e.key === 'I') {
        if (activeItem) setSelectedItem(activeItem);
      } else if (e.key === 'Delete') {
        setShowDeleteConfirm(true);
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        handleSetRating(parseInt(e.key, 10));
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
        setZoom((z) => Math.min(z + 0.25, 5));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((z) => {
          const next = Math.max(z - 0.25, 0.5);
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    lightboxIndex,
    showDeleteConfirm,
    closeLightbox,
    nextLightboxItem,
    prevLightboxItem,
    activeItem,
    isPhotoOrRaw,
    handleRotateCw,
    handleToggleFavorite,
    handleSetRating,
    setSelectedItem,
  ]);

  if (!activeItem || lightboxIndex === null) return null;

  const isFirst = lightboxIndex === 0;
  const isLast = lightboxIndex === lightboxItems.length - 1;

  const handleInspect = () => {
    setSelectedItem(activeItem);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!isPhotoOrRaw) return;
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom((prev) => {
      const next = Math.max(0.5, Math.min(5, Number((prev + delta).toFixed(2))));
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isPhotoOrRaw || zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const handleDoubleClick = () => {
    if (!isPhotoOrRaw) return;
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2);
    }
  };

  const thumbnailUrl = getThumbnailUrl(activeItem.file_hash, activeItem.media_type);
  const fullMediaUrl =
    isTauri() && activeItem.media_type !== 'raw'
      ? convertFileSrc(activeItem.file_path)
      : thumbnailUrl;

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
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <button
            onClick={closeLightbox}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: 6, flexShrink: 0 }}
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    {isPlayingVideo ? 'Playing' : 'Paused (Space)'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Curation, Slideshow, Zoom & Inspect Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Favorite Button (F) */}
          <button
            onClick={handleToggleFavorite}
            title="Toggle Favorite (F)"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: isFavorite ? '1px solid #f87171' : '1px solid var(--surface-glass-border)',
              backgroundColor: isFavorite ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-secondary)',
              color: isFavorite ? '#f87171' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            <Heart size={14} fill={isFavorite ? '#f87171' : 'none'} />
          </button>

          {/* 5-Star Rating Bar (Keys 1-5) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--surface-glass-border)',
            }}
            title="Rate 1-5 stars (Keys 1-5)"
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleSetRating(star)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  color: star <= rating ? '#fbbf24' : 'var(--text-muted)',
                }}
              >
                <Star size={14} fill={star <= rating ? '#fbbf24' : 'none'} />
              </button>
            ))}
          </div>

          {/* Slideshow Controls (S) */}
          {lightboxItems.length > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: isSlideshowActive ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                border: isSlideshowActive ? '1px solid var(--accent-primary)' : '1px solid var(--surface-glass-border)',
                padding: '2px 4px',
              }}
            >
              <button
                onClick={() => setIsSlideshowActive(!isSlideshowActive)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isSlideshowActive ? 'var(--accent-primary)' : '#ffffff',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
                title="Toggle Slideshow (S)"
              >
                {isSlideshowActive ? <Pause size={13} /> : <Play size={13} />}
                <span>{isSlideshowActive ? 'Playing' : 'Slideshow'}</span>
              </button>
              {isSlideshowActive && (
                <select
                  value={slideshowIntervalSec}
                  onChange={(e) => setSlideshowIntervalSec(Number(e.target.value))}
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    border: 'none',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    outline: 'none',
                    paddingRight: 4,
                  }}
                  title="Slideshow interval"
                >
                  <option value={3} style={{ background: '#0f172a' }}>3s</option>
                  <option value={4} style={{ background: '#0f172a' }}>4s</option>
                  <option value={6} style={{ background: '#0f172a' }}>6s</option>
                </select>
              )}
            </div>
          )}

          {isPhotoOrRaw && (
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
                onClick={() =>
                  setZoom((z) => {
                    const next = Math.max(z - 0.25, 0.5);
                    if (next <= 1) setPan({ x: 0, y: 0 });
                    return next;
                  })
                }
                style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Zoom out (- or Scroll Down)"
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: '0.75rem', padding: '0 6px', color: 'var(--text-secondary)' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
                style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Zoom in (+ or Scroll Up)"
              >
                <ZoomIn size={14} />
              </button>
              {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.72rem', padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                >
                  <RotateCcw size={11} />
                  Reset
                </button>
              )}
            </div>
          )}

          {isPhotoOrRaw && (
            <button
              className="btn-secondary"
              onClick={handleRotateCw}
              style={{ fontSize: '0.8rem', padding: '6px 10px', gap: 5 }}
              title="Rotate 90° Clockwise (R)"
            >
              <RotateCw size={14} />
              Rotate
            </button>
          )}

          <button
            className="btn-secondary"
            onClick={handleInspect}
            style={{ fontSize: '0.8rem', padding: '6px 10px', gap: 5 }}
            title="Open Metadata Inspector (I)"
          >
            <Info size={14} />
            Info
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete item (Delete)"
            style={{
              padding: '6px 9px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Trash2 size={14} />
          </button>

          <button
            onClick={closeLightbox}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Centered Media Stage */}
      <main
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: 24,
          cursor: isPhotoOrRaw && zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {/* Navigation Arrows */}
        {!isFirst && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevLightboxItem();
            }}
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
              cursor: 'pointer',
              border: '1px solid var(--surface-glass-border)',
              zIndex: 20,
              transition: 'all 0.2s ease',
            }}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {!isLast && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextLightboxItem();
            }}
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
              cursor: 'pointer',
              border: '1px solid var(--surface-glass-border)',
              zIndex: 20,
              transition: 'all 0.2s ease',
            }}
          >
            <ChevronRight size={24} />
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
            position: 'relative',
            transition: isDragging ? 'none' : 'transform 0.18s cubic-bezier(0.2, 0, 0, 1)',
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          {activeItem.media_type === 'video' ? (
            <video
              ref={videoRef}
              src={fullMediaUrl}
              poster={thumbnailUrl}
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
              onEnded={() => {
                setIsPlayingVideo(false);
                if (isSlideshowActive) {
                  advanceSlideshowItem();
                }
              }}
            />
          ) : (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Progressive low-res placeholder blurred backdrop while full resolution loads */}
              {!isFullResLoaded && (
                <img
                  src={thumbnailUrl}
                  alt={activeItem.file_name}
                  draggable={false}
                  style={{
                    maxWidth: '85vw',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-sm)',
                    filter: 'blur(8px)',
                    opacity: 0.7,
                  }}
                />
              )}
              {/* Full-resolution asset streamed from local filesystem */}
              <img
                src={fullMediaUrl}
                alt={activeItem.file_name}
                draggable={false}
                onLoad={() => setIsFullResLoaded(true)}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.src.includes('puntano-thumb') && thumbnailUrl) {
                    target.src = thumbnailUrl;
                  }
                  setIsFullResLoaded(true);
                }}
                style={{
                  maxWidth: '85vw',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
                  position: isFullResLoaded ? 'static' : 'absolute',
                  opacity: isFullResLoaded ? 1 : 0,
                  transition: 'opacity 0.2s ease-in',
                }}
              />
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal inside Lightbox */}
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
                border: '1px solid rgba(239, 68, 68, 0.35)',
                backgroundColor: 'var(--bg-primary)',
                boxShadow: 'var(--shadow-xl)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444', marginBottom: 12 }}>
                <AlertTriangle size={22} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Delete {activeItem.file_name}</h3>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
                Choose whether to remove this item from the Puntano library index or move the file to your OS Recycle Bin / Trash.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn-secondary"
                  disabled={isDeleting}
                  onClick={() => handleDeleteCurrentItem(false)}
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
                    Keeps the physical file on disk; removes it from the index.
                  </div>
                </button>
                <button
                  disabled={isDeleting}
                  onClick={() => handleDeleteCurrentItem(true)}
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
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={13} />
                    Move to Recycle Bin / Trash
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(239, 68, 68, 0.8)' }}>
                    Moves the file to your system Recycle Bin / Trash and removes it from the index.
                  </div>
                </button>
                <button
                  className="btn-secondary"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{ marginTop: 4, justifyContent: 'center' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
