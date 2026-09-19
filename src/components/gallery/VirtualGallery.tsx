import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { tauriApi } from '../../services/tauriApi';
import { MediaItem } from '../../types/media';

import { getThumbnailUrl } from '../../services/thumbnailProtocol';

export const VirtualGallery: React.FC = () => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const COLUMNS = 5;

  useEffect(() => {
    // Load initial virtualized page
    tauriApi.queryMediaPaged(500, 0).then((data) => {
      setItems(data);
    });
  }, []);

  const rowCount = Math.ceil(items.length / COLUMNS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 3,
  });

  return (
    <div
      ref={parentRef}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '24px',
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * COLUMNS;
          const rowItems = items.slice(startIndex, startIndex + COLUMNS);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
                gap: 16,
                paddingBottom: 16,
              }}
            >
              {rowItems.map((item) => (
                <div
                  key={item.id}
                  className="glass-panel"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      height: 140,
                    }}
                  >
                    <img
                      src={getThumbnailUrl(item.file_hash, item.media_type)}
                      alt={item.file_name}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'opacity 0.2s ease',
                      }}
                      onError={(e) => {
                        // Fallback icon on error or pending
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        padding: '2px 6px',
                        borderRadius: 4,
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(4px)',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                      }}
                    >
                      {item.media_type === 'video' ? '🎬' : '📷'}
                    </div>
                  </div>
                  <div style={{ padding: '8px 12px', borderTop: '1px solid var(--surface-glass-border)' }}>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.file_name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {(item.file_size / (1024 * 1024)).toFixed(1)} MB
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
