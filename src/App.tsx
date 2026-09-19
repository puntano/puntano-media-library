import React, { useState } from 'react';
import {
  Map as MapIcon,
  Calendar as CalendarIcon,
  Grid3X3,
  Image as ImageIcon,
  Film,
  Plus,
  Settings,
} from 'lucide-react';
import { useLibraryStore } from './stores/libraryStore';
import { MapView } from './components/map/MapView';
import { TimelineView } from './components/timeline/TimelineView';
import { VirtualGallery } from './components/gallery/VirtualGallery';
import { IndexingPanel } from './components/indexing/IndexingPanel';
import { MetadataDrawer } from './components/inspector/MetadataDrawer';
import { FilterBar } from './components/search/FilterBar';
import { LightboxModal } from './components/viewer/LightboxModal';
import { LibrarySettingsModal } from './components/settings/LibrarySettingsModal';

export const App: React.FC = () => {
  const { activeView, setActiveView, mediaTypeFilter, setMediaTypeFilter, totalMediaCount } = useLibraryStore();
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
              fontWeight: 800,
              fontSize: '1.1rem',
              color: '#ffffff',
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
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
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
            gap: 2,
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
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <MapIcon size={15} />
            Map View
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
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <CalendarIcon size={15} />
            Timeline
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
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <Grid3X3 size={15} />
            Gallery
          </button>
        </div>

        {/* Right Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: mediaTypeFilter === type ? 'var(--surface-glass-hover)' : 'transparent',
                  color: mediaTypeFilter === type ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {type === 'photo' && <ImageIcon size={12} />}
                {type === 'video' && <Film size={12} />}
                {type}
              </button>
            ))}
          </div>

          {/* Settings / Library Management */}
          <button
            className="btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            title="Library Management & Maintenance"
            style={{ padding: '8px 10px' }}
          >
            <Settings size={16} />
          </button>

          {/* Indexing Trigger Button */}
          <button className="btn-primary" onClick={() => setShowIndexModal(true)} style={{ gap: 6 }}>
            <Plus size={16} />
            Index Directory
          </button>
        </div>
      </header>

      {/* Multi-Criteria Search & Filter Bar */}
      <FilterBar />

      {/* Main View Area */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeView === 'map' && <MapView />}
        {activeView === 'timeline' && <TimelineView />}
        {activeView === 'gallery' && <VirtualGallery />}
      </main>

      {/* Indexing Modal */}
      {showIndexModal && <IndexingPanel onClose={() => setShowIndexModal(false)} />}

      {/* Library Settings & Health Modal */}
      {showSettingsModal && (
        <LibrarySettingsModal
          onClose={() => setShowSettingsModal(false)}
          onOpenIndexModal={() => setShowIndexModal(true)}
        />
      )}

      {/* Slide-Over Metadata Inspector */}
      <MetadataDrawer />

      {/* Fullscreen Media Lightbox */}
      <LightboxModal />
    </div>
  );
};
