import React, { useEffect, useState } from 'react';
import { Calendar, ChevronRight, Sparkles } from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { MemoryGroup } from '../../types/media';
import { MediaThumbnail } from '../common/MediaThumbnail';
import { useLibraryStore } from '../../stores/libraryStore';

export const MemoriesBanner: React.FC = () => {
  const [memories, setMemories] = useState<MemoryGroup[]>([]);
  const { openLightbox } = useLibraryStore();

  useEffect(() => {
    tauriApi
      .queryOnThisDayMemories()
      .then((data) => {
        setMemories(data);
      })
      .catch((err) => {
        console.error('Failed to load On This Day memories:', err);
      });
  }, []);

  if (memories.length === 0) return null;

  const handleOpenMemory = (group: MemoryGroup) => {
    openLightbox(group.items, 0);
  };

  return (
    <div
      style={{
        padding: '16px 24px 8px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={16} color="var(--accent-primary)" />
        <span style={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: '-0.01em' }}>
          Memories • On This Day
        </span>
        <span
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          {memories.length} {memories.length === 1 ? 'anniversary' : 'anniversaries'}
        </span>
      </div>

      {/* Horizontal Scrollable Memories Cards */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          overflowX: 'auto',
          paddingBottom: 8,
          scrollbarWidth: 'thin',
        }}
      >
        {memories.map((group) => {
          const timeLabel =
            group.years_ago === 1
              ? '1 Year Ago'
              : `${group.years_ago} Years Ago`;

          return (
            <div
              key={group.year}
              onClick={() => handleOpenMemory(group)}
              className="glass-panel"
              style={{
                position: 'relative',
                width: 170,
                height: 230,
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: 'var(--shadow-md)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                border: '1px solid var(--surface-glass-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }}
            >
              {/* Background Cover Thumbnail */}
              <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
                <MediaThumbnail
                  filePath={group.cover_item.file_path}
                  fileHash={group.cover_item.file_hash}
                  mediaType={group.cover_item.media_type}
                  alt={group.cover_item.file_name}
                />
              </div>

              {/* Gradient Overlays */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 2,
                  background:
                    'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)',
                }}
              />

              {/* Top Badge: Year */}
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  zIndex: 3,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  backdropFilter: 'blur(8px)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Calendar size={12} color="var(--accent-primary)" />
                {group.year}
              </div>

              {/* Bottom Content */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  right: 12,
                  zIndex: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                  {timeLabel}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    {group.count} {group.count === 1 ? 'photo' : 'photos'}
                  </span>
                  <ChevronRight size={13} color="rgba(255,255,255,0.7)" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

