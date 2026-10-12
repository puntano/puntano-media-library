import React, { memo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';
import { isTauri } from '../../services/tauriApi';

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
  const rotationDeg =
    orientation === 6 || orientation === 90 ? 90 :
    orientation === 3 || orientation === 180 ? 180 :
    orientation === 8 || orientation === 270 ? 270 : 0;

  return (
    <img
      src={getThumbnailUrl(fileHash, mediaType)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={(e) => {
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
