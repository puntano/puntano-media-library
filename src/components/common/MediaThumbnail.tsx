import React, { memo, useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';
import { isTauri } from '../../services/tauriApi';
import { useLibraryStore } from '../../stores/libraryStore';

interface MediaThumbnailProps {
  filePath: string;
  fileHash: string;
  mediaType: string;
  orientation?: number;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = memo(({
  filePath,
  fileHash,
  mediaType,
  orientation,
  alt = '',
  style,
  className,
}) => {
  const [isPending, setIsPending] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [fallbackDirectSrc, setFallbackDirectSrc] = useState<string | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  const thumbnailRevision = useLibraryStore((s) => (isPending ? s.thumbnailRevision : 0));
  const syncRevision = useLibraryStore((s) => s.syncRevision);

  // Reset state if fileHash, filePath, or library syncRevision changes
  useEffect(() => {
    setIsPending(false);
    setRetryCount(0);
    setFallbackDirectSrc(null);
    setHasFailed(false);
  }, [fileHash, filePath, syncRevision]);

  // Trigger immediate retry whenever background thumbnail worker completes a batch
  useEffect(() => {
    if (isPending && thumbnailRevision > 0) {
      setRetryCount((c) => c + 1);
    }
  }, [isPending, thumbnailRevision]);

  // Progressive-backoff fallback polling while genuinely pending (handles large 25k+ queues without hard cutoff)
  useEffect(() => {
    if (!isPending) return;
    const delayMs = Math.min(8000, 1500 + retryCount * 400);
    const timer = setTimeout(() => {
      setRetryCount((c) => c + 1);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [isPending, retryCount]);

  const rotationDeg =
    orientation === 6 || orientation === 90 ? 90 :
    orientation === 3 || orientation === 180 ? 180 :
    orientation === 8 || orientation === 270 ? 270 : 0;

  if (hasFailed) {
    const extMatch = filePath.split('.').pop();
    const extBadge = extMatch && extMatch.length <= 6 ? extMatch.toUpperCase() : mediaType.toUpperCase();
    return (
      <div
        className={className}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#141c2b',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          color: '#64748b',
          fontSize: '0.68rem',
          fontWeight: 600,
          userSelect: 'none',
          padding: 8,
          textAlign: 'center',
          ...style,
        }}
      >
        <span
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            backgroundColor: 'rgba(100, 116, 139, 0.16)',
            color: '#94a3b8',
            fontSize: '0.62rem',
            letterSpacing: '0.04em',
          }}
        >
          {extBadge}
        </span>
        <span>Preview unavailable</span>
      </div>
    );
  }

  const baseUrl = getThumbnailUrl(fileHash, mediaType);
  const srcUrl = fallbackDirectSrc
    ? fallbackDirectSrc
    : retryCount > 0 && isTauri()
    ? `${baseUrl}?rev=${retryCount}`
    : baseUrl;

  return (
    <img
      src={srcUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onLoad={(e) => {
        const imgEl = e.currentTarget;
        // The backend "PROCESSING..." SVG has natural dimensions 385x289, whereas real thumbnails are <= 384px
        if (!fallbackDirectSrc && imgEl.naturalWidth === 385 && imgEl.naturalHeight === 289) {
          if (!isPending) setIsPending(true);
        } else if (isPending) {
          setIsPending(false);
        }
      }}
      onError={() => {
        setIsPending(false);
        if (!fallbackDirectSrc && (mediaType === 'photo' || mediaType === 'raw') && isTauri()) {
          try {
            setFallbackDirectSrc(convertFileSrc(filePath));
            return;
          } catch {}
        }
        setHasFailed(true);
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        transform: rotationDeg !== 0 ? `rotate(${rotationDeg}deg)` : undefined,
        ...style,
      }}
    />
  );
});
