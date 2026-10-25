import React, { useEffect, useState } from 'react';
import {
  Map as MapIcon,
  Calendar as CalendarIcon,
  Grid3X3,
  FolderHeart,
  Image as ImageIcon,
  Film,
  Plus,
  Settings,
  Copy,
  Keyboard,
  Terminal,
  Loader2,
  ArrowUpCircle,
} from 'lucide-react';
import { useLibraryStore } from './stores/libraryStore';
import { useUpdaterStore } from './stores/updaterStore';
import { tauriApi } from './services/tauriApi';
import { MapView } from './components/map/MapView';
import { TimelineView } from './components/timeline/TimelineView';
import { VirtualGallery } from './components/gallery/VirtualGallery';
import { AlbumsView } from './components/albums/AlbumsView';
import { IndexingPanel } from './components/indexing/IndexingPanel';
import { MetadataDrawer } from './components/inspector/MetadataDrawer';
import { FilterBar } from './components/search/FilterBar';
import { LightboxModal } from './components/viewer/LightboxModal';
import { LibrarySettingsModal } from './components/settings/LibrarySettingsModal';
import { DuplicatesModal } from './components/duplicates/DuplicatesModal';
import { KeyboardShortcutsModal } from './components/common/KeyboardShortcutsModal';
import { DiagnosticModal } from './components/settings/DiagnosticModal';
import { UpdateModal } from './components/settings/UpdateModal';

export const App: React.FC = () => {
  const {
    activeView,
    setActiveView,
    mediaTypeFilter,
    setMediaTypeFilter,
    totalMediaCount,
    setTotalMediaCount,
    isIndexing,
    setIsIndexing,
    setIndexingProgress,
    incrementSyncRevision,
    incrementThumbnailRevision,
    isDuplicateModalOpen,
    setDuplicateModalOpen,
    isShortcutsModalOpen,
    setShortcutsModalOpen,
  } = useLibraryStore();
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const {
    status: updaterStatus,
    updateInfo,
    checkForUpdates,
    setUpdateModalOpen,
  } = useUpdaterStore();

  // Initialize total count on launch
  useEffect(() => {
    tauriApi.getTotalMediaCount().then((count) => setTotalMediaCount(count)).catch(console.error);
  }, [setTotalMediaCount]);

  // Silent background auto-update check on startup (delayed 3.5s) and every 6 hours
  useEffect(() => {
    const startupTimer = setTimeout(() => {
      if (!useLibraryStore.getState().isIndexing) {
        checkForUpdates({ silent: true });
      }
    }, 3500);

    const periodicTimer = setInterval(() => {
      if (!useLibraryStore.getState().isIndexing) {
        checkForUpdates({ silent: true });
      }
    }, 6 * 60 * 60 * 1000);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(periodicTimer);
    };
  }, [checkForUpdates]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen(!isShortcutsModalOpen);
      } else if (e.key === '1') {
        setActiveView('map');
      } else if (e.key === '2') {
        setActiveView('timeline');
      } else if (e.key === '3') {
        setActiveView('gallery');
      } else if (e.key === '4') {
        setActiveView('albums');
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isShortcutsModalOpen, setShortcutsModalOpen, setActiveView]);

  // Global indexing progress listener (single subscription across modal open/close & re-scans)
  useEffect(() => {
    let isDisposed = false;
    let lastLiveRefresh = 0;

    const unlistenPromise = tauriApi.onIndexingProgress((progress) => {
      if (isDisposed) return;
      setIndexingProgress(progress);

      if (progress.is_complete) {
        setIsIndexing(false);
        tauriApi
          .getTotalMediaCount()
          .then((count) => {
            if (!isDisposed) {
              setTotalMediaCount(count);
              incrementSyncRevision();
            }
          })
          .catch(console.error);
      } else {
        setIsIndexing(true);
        const now = Date.now();
        if (progress.stage === 'indexing' && progress.indexed_files > 0 && now - lastLiveRefresh >= 2500) {
          lastLiveRefresh = now;
          tauriApi
            .getTotalMediaCount()
            .then((count) => {
              if (!isDisposed) {
                setTotalMediaCount(count);
                incrementSyncRevision();
              }
            })
            .catch(() => {});
        }
      }
    });

    return () => {
      isDisposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setIndexingProgress, setIsIndexing, setTotalMediaCount, incrementSyncRevision]);

  // Real-time synchronization when live watcher detects filesystem changes
  useEffect(() => {
    let isDisposed = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unlistenPromise = tauriApi.onLibraryIncrementalSync((_path) => {
      if (isDisposed) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (isDisposed) return;
        try {
          const count = await tauriApi.getTotalMediaCount();
          if (!isDisposed) {
            setTotalMediaCount(count);
            incrementSyncRevision();
          }
        } catch (err) {
          console.error('Failed to sync on watcher event:', err);
        }
      }, 400);
    });

    return () => {
      isDisposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setTotalMediaCount, incrementSyncRevision]);

  // Real-time notification when background thumbnail worker finishes batches
  useEffect(() => {
    let isDisposed = false;
    let thumbTimer: ReturnType<typeof setTimeout> | null = null;
    const unlistenPromise = tauriApi.onThumbnailsReady(() => {
      if (isDisposed) return;
      if (thumbTimer) clearTimeout(thumbTimer);
      thumbTimer = setTimeout(() => {
        if (!isDisposed) {
          incrementThumbnailRevision();
        }
      }, 300);
    });

    return () => {
      isDisposed = true;
      if (thumbTimer) clearTimeout(thumbTimer);
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [incrementThumbnailRevision]);

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
          <button
            onClick={() => setActiveView('albums')}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              backgroundColor: activeView === 'albums' ? 'var(--accent-primary)' : 'transparent',
              color: activeView === 'albums' ? '#ffffff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
          >
            <FolderHeart size={15} />
            Albums
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

          {/* Duplicates Cleaner Trigger */}
          <button
            className="btn-secondary"
            onClick={() => setDuplicateModalOpen(true)}
            title="Scan & Clean Duplicate Files"
            style={{ padding: '8px 10px' }}
          >
            <Copy size={16} color="var(--accent-primary)" />
          </button>

          {/* Keyboard Shortcuts Trigger */}
          <button
            className="btn-secondary"
            onClick={() => setShortcutsModalOpen(true)}
            title="Keyboard Shortcuts (?)"
            style={{ padding: '8px 10px' }}
          >
            <Keyboard size={16} />
          </button>

          {/* Settings / Library Management */}
          <button
            className="btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            title="Library Management & Maintenance"
            style={{ padding: '8px 10px' }}
          >
            <Settings size={16} />
          </button>

          {/* System Diagnostics & Logs */}
          <button
            className="btn-secondary"
            onClick={() => setShowDiagnosticModal(true)}
            title="System Diagnostics & Logs"
            style={{ padding: '8px 10px' }}
          >
            <Terminal size={16} />
          </button>

          {/* Software Update Notification Badge */}
          {updateInfo && (
            <button
              onClick={() => setUpdateModalOpen(true)}
              title={`Puntano Media Library v${updateInfo.version} is available`}
              style={{
                padding: '7px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(16, 185, 129, 0.45)',
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                color: '#34d399',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              {updaterStatus === 'downloading' ||
              updaterStatus === 'installing' ||
              updaterStatus === 'restarting' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowUpCircle size={15} />
              )}
              Update v{updateInfo.version}
            </button>
          )}

          {/* Indexing Trigger Button */}
          <button className="btn-primary" onClick={() => setShowIndexModal(true)} style={{ gap: 6 }}>
            {isIndexing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {isIndexing ? 'Indexing...' : 'Index Directory'}
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
        {activeView === 'albums' && <AlbumsView />}
      </main>

      {/* Duplicates Cleaner Modal */}
      {isDuplicateModalOpen && <DuplicatesModal />}

      {/* Indexing Modal */}
      {showIndexModal && <IndexingPanel onClose={() => setShowIndexModal(false)} />}

      {/* Library Settings & Health Modal */}
      {showSettingsModal && (
        <LibrarySettingsModal
          onClose={() => setShowSettingsModal(false)}
          onOpenIndexModal={() => setShowIndexModal(true)}
        />
      )}

      {/* System Diagnostics & Logs Modal */}
      {showDiagnosticModal && (
        <DiagnosticModal onClose={() => setShowDiagnosticModal(false)} />
      )}

      {/* Software Auto-Update Modal */}
      <UpdateModal />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal />

      {/* Slide-Over Metadata Inspector */}
      <MetadataDrawer />

      {/* Fullscreen Media Lightbox */}
      <LightboxModal />
    </div>
  );
};
