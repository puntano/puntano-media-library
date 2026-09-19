import React, { useState } from 'react';
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
  const [videoError, setVideoError] = useState(false);

  if (mediaType === 'video' && !videoError) {
    return (
      <video
        src={`${convertFileSrc(filePath)}#t=0.5`}
        preload="metadata"
        muted
        playsInline
        onError={() => setVideoError(true)}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          ...style,
        }}
      />
    );
  }

  return (
    <img
      src={getThumbnailUrl(fileHash, mediaType)}
      alt={alt}
      loading="lazy"
      className={className}
      onError={(e) => {
        const imgEl = e.target as HTMLImageElement;
        if (isTauri() && !imgEl.src.includes('asset.localhost') && !imgEl.src.startsWith('asset://')) {
          try {
            imgEl.src = convertFileSrc(filePath);
          } catch {}
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...style,
      }}
    />
  );
};
