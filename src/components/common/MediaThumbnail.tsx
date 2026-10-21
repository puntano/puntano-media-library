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
  const thumbnailRevision = useLibraryStore((s) => (isPending ? s.thumbnailRevision : 0));

  // Reset state if fileHash changes
  useEffect(() => {
    setIsPending(false);
    setRetryCount(0);
  }, [fileHash]);

  // Trigger retry when background thumbnail worker emits batch completion
  useEffect(() => {
    if (isPending && thumbnailRevision > 0 && retryCount < 20) {
      setRetryCount((c) => c + 1);
    }
  }, [isPending, thumbnailRevision]);

  // Fallback polling for pending thumbnails in case batch event already fired before mount
  useEffect(() => {
    if (!isPending || retryCount >= 20) return;
    const timer = setTimeout(() => {
      setRetryCount((c) => c + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isPending, retryCount]);

  const rotationDeg =
    orientation === 6 || orientation === 90 ? 90 :
    orientation === 3 || orientation === 180 ? 180 :
    orientation === 8 || orientation === 270 ? 270 : 0;

  const baseUrl = getThumbnailUrl(fileHash, mediaType);
  const srcUrl = retryCount > 0 && isTauri() ? `${baseUrl}?rev=${retryCount}` : baseUrl;

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
        if (imgEl.naturalWidth === 385 && imgEl.naturalHeight === 289) {
          if (!isPending) setIsPending(true);
        } else if (isPending) {
          setIsPending(false);
        }
      }}
      onError={(e) => {
        setIsPending(false);
        const imgEl = e.target as HTMLImageElement;
        if (mediaType === 'photo' && isTauri() && !imgEl.src.includes('asset.localhost') && !imgEl.src.startsWith('asset://')) {
          try {
            imgEl.src = convertFileSrc(filePath);
          } catch {}
        }
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
