import React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getThumbnailUrl } from '../../services/thumbnailProtocol';
import { isTauri } from '../../services/tauriApi';

interface MediaThumbnailProps {
  filePath: string;
  fileHash: string;
  mediaType: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  filePath,
  fileHash,
  mediaType,
  alt = '',
  style,
  className,
}) => {
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
        ...style,
      }}
    />
  );
};
