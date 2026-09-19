import React, { useEffect, useState } from 'react';
import {
  X,
  Folder,
  HardDrive,
  RefreshCw,
  Trash2,
  FolderPlus,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { LibraryInfo } from '../../types/media';
import { useLibraryStore } from '../../stores/libraryStore';

interface LibrarySettingsModalProps {
  onClose: () => void;
  onOpenIndexModal: () => void;
}

export const LibrarySettingsModal: React.FC<LibrarySettingsModalProps> = ({
  onClose,
  onOpenIndexModal,
}) => {
  const [libraries, setLibraries] = useState<LibraryInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pruningStatus, setPruningStatus] = useState<string | null>(null);
  const [rescanStatus, setRescanStatus] = useState<string | null>(null);
  const { setTotalMediaCount } = useLibraryStore();

  const loadLibraries = async () => {
    setIsLoading(true);
    try {
      const data = await tauriApi.getLibraries();
      setLibraries(data);
    } catch (err) {
      console.error('Failed to load libraries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLibraries();
  }, []);

  const handleRemoveLibrary = async (lib: LibraryInfo) => {
    if (!confirm(`Are you sure you want to unlink "${lib.path}"?\n\nThis will remove it from the library index. Your original media files on disk will NOT be deleted.`)) {
      return;
    }

    try {
      await tauriApi.removeLibrary(lib.id);
      await loadLibraries();
      const count = await tauriApi.getTotalMediaCount();
      setTotalMediaCount(count);
    } catch (err) {
      console.error('Failed to unlink library:', err);
    }
  };

  const handleRescan = async (lib: LibraryInfo) => {
    setRescanStatus(`Scanning ${lib.path}...`);
    try {
      await tauriApi.startIndexing(lib.path);
      setRescanStatus(`Scan complete for ${lib.path}`);
      await loadLibraries();
      const count = await tauriApi.getTotalMediaCount();
      setTotalMediaCount(count);
      setTimeout(() => setRescanStatus(null), 4000);
    } catch (err) {
      console.error('Re-scan failed:', err);
      setRescanStatus(`Error re-scanning ${lib.path}`);
      setTimeout(() => setRescanStatus(null), 4000);
    }
  };

  const handlePrune = async () => {
    setPruningStatus('Scanning for missing files...');
    try {
      const pruned = await tauriApi.pruneMissingFiles();
      setPruningStatus(
        pruned > 0
          ? `Cleaned up ${pruned} missing / moved files from database.`
          : 'All library files are verified on disk. Zero missing records.'
      );
      await loadLibraries();
      const count = await tauriApi.getTotalMediaCount();
      setTotalMediaCount(count);
      setTimeout(() => setPruningStatus(null), 5000);
    } catch (err) {
      console.error('Prune failed:', err);
      setPruningStatus('Failed to prune missing files.');
      setTimeout(() => setPruningStatus(null), 5000);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: 680,
          maxHeight: '85vh',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 64,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--surface-glass-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--surface-glass-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
              }}
            >
              <Folder size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                Library Management
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Registered folders, automated synchronization, and maintenance
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Notification Banner */}
          {(pruningStatus || rescanStatus) && (
            <div
              className="glass-panel"
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
              }}
            >
              <CheckCircle2 size={16} color="var(--accent-primary)" />
              <span>{rescanStatus || pruningStatus}</span>
            </div>
          )}

          {/* Registered Libraries Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Library Folders ({libraries.length})
              </h4>
              <button
                className="btn-secondary"
                onClick={() => {
                  onClose();
                  onOpenIndexModal();
                }}
                style={{ fontSize: '0.75rem', padding: '4px 10px', gap: 6 }}
              >
                <FolderPlus size={14} />
                Add Folder
              </button>
            </div>

            {isLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading libraries...
              </div>
            ) : libraries.length === 0 ? (
              <div
                className="glass-panel"
                style={{
                  padding: '28px 20px',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Folder size={32} color="var(--text-muted)" />
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>No library folders registered</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 360 }}>
                  Click "+ Index Directory" to add your first folder of photos and videos.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {libraries.map((lib) => (
                  <div
                    key={lib.id}
                    className="glass-panel"
                    style={{
                      padding: '14px 18px',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {lib.path}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          marginTop: 4,
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <HardDrive size={12} />
                          {lib.total_files.toLocaleString()} indexed files
                        </span>
                        {lib.last_scanned_at && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} />
                            Scanned {new Date(lib.last_scanned_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="btn-secondary"
                        onClick={() => handleRescan(lib)}
                        title="Run differential re-scan"
                        style={{ padding: '6px 10px', fontSize: '0.75rem', gap: 4 }}
                      >
                        <RefreshCw size={13} />
                        Re-scan
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => handleRemoveLibrary(lib)}
                        title="Unlink library from database"
                        style={{
                          padding: '6px 10px',
                          fontSize: '0.75rem',
                          color: 'var(--status-danger)',
                          borderColor: 'rgba(239, 68, 68, 0.25)',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Database Maintenance Section */}
          <div style={{ marginTop: 8 }}>
            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Database Maintenance
            </h4>

            <div
              className="glass-panel"
              style={{
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="var(--accent-primary)" />
                  Prune Missing & Deleted Files
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, maxWidth: 440 }}>
                  Verifies all media records against physical files on disk and purges entries for photos or videos that have been moved or deleted.
                </div>
              </div>

              <button
                className="btn-secondary"
                onClick={handlePrune}
                style={{ padding: '8px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              >
                Prune Now
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            height: 60,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderTop: '1px solid var(--surface-glass-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button className="btn-secondary" onClick={onClose} style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
