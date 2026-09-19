import React, { useState } from 'react';
import { useLibraryStore } from './stores/libraryStore';
import { MapView } from './components/map/MapView';
import { TimelineView } from './components/timeline/TimelineView';
import { VirtualGallery } from './components/gallery/VirtualGallery';
import { IndexingPanel } from './components/indexing/IndexingPanel';

export const App: React.FC = () => {
  const { activeView, setActiveView, mediaTypeFilter, setMediaTypeFilter, totalMediaCount } = useLibraryStore();
  const [showIndexModal, setShowIndexModal] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Top Application Header */}
      <header
        className="glass-panel"
        style={{
          height: 64,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--surface-glass-border)',
          zIndex: 50,
        }}
      >
        {/* Brand & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
              fontWeight: 800,
              fontSize: '1rem',
            }}
          >
            P
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 8 }}>
              Puntano Media Library
              {totalMediaCount > 0 && (
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12, background: 'var(--surface-glass-hover)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                  {totalMediaCount.toLocaleString()} items
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              High-Performance Cross-Platform Engine
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-secondary)',
            padding: 4,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--surface-glass-border)',
          }}
        >
          <button
            onClick={() => setActiveView('map')}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              backgroundColor: activeView === 'map' ? 'var(--accent-primary)' : 'transparent',
              color: activeView === 'map' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            🗺️ Map View
          </button>
          <button
            onClick={() => setActiveView('timeline')}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              backgroundColor: activeView === 'timeline' ? 'var(--accent-primary)' : 'transparent',
              color: activeView === 'timeline' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            📅 Timeline
          </button>
          <button
            onClick={() => setActiveView('gallery')}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              backgroundColor: activeView === 'gallery' ? 'var(--accent-primary)' : 'transparent',
              color: activeView === 'gallery' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            🖼️ Gallery
          </button>
        </div>

        {/* Right Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Media Type Filter */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-secondary)',
              padding: 2,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--surface-glass-border)',
            }}
          >
            {(['all', 'photo', 'video'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setMediaTypeFilter(type)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  backgroundColor: mediaTypeFilter === type ? 'var(--surface-glass-hover)' : 'transparent',
                  color: mediaTypeFilter === type ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Indexing Trigger Button */}
          <button className="btn-primary" onClick={() => setShowIndexModal(true)}>
            + Index Directory
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeView === 'map' && <MapView />}
        {activeView === 'timeline' && <TimelineView />}
        {activeView === 'gallery' && <VirtualGallery />}
      </main>

      {/* Indexing Modal */}
      {showIndexModal && <IndexingPanel onClose={() => setShowIndexModal(false)} />}
    </div>
  );
};
