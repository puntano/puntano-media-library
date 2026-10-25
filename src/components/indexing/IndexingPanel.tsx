import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, AlertTriangle, Terminal, Loader2 } from 'lucide-react';
import { useLibraryStore } from '../../stores/libraryStore';
import { tauriApi, isTauri } from '../../services/tauriApi';
import { DiagnosticModal } from '../settings/DiagnosticModal';

export const IndexingPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [folderPath, setFolderPath] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const {
    isIndexing,
    setIsIndexing,
    indexingProgress,
    setIndexingProgress,
    setTotalMediaCount,
    incrementSyncRevision,
  } = useLibraryStore();

  const handleBrowseFolder = async () => {
    setErrorMessage(null);
    if (!isTauri()) {
      const mockDir = prompt('Enter local folder path for browser mock:', 'C:\\Pictures\\Library');
      if (mockDir) setFolderPath(mockDir);
      return;
    }

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Media Library Directory',
      });

      if (selected && typeof selected === 'string') {
        setFolderPath(selected);
      }
    } catch (err) {
      console.error('Directory picker failed:', err);
    }
  };

  const handleStartIndexing = async () => {
    const targetFolder = folderPath.trim();
    if (!targetFolder || isIndexing) return;
    setErrorMessage(null);
    setIndexingProgress({
      stage: 'discovering',
      scanned_files: 0,
      indexed_files: 0,
      current_directory: targetFolder,
      is_complete: false,
      elapsed_ms: 0,
    });
    setIsIndexing(true);

    try {
      const indexedCount = await tauriApi.startIndexing(targetFolder);
      const count = await tauriApi.getTotalMediaCount();
      setTotalMediaCount(count);
      incrementSyncRevision();

      if (indexedCount === 0) {
        setErrorMessage(
          'Discovery finished, but 0 supported media files were found in this directory. Ensure the path is correct and that the app has permissions to read files inside it.'
        );
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'Indexing failed to start or was interrupted.';
      console.error('Indexing failed:', msg);
      setErrorMessage(msg);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleCancel = async () => {
    await tauriApi.cancelIndexing();
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}
      >
        <div
          className="glass-panel"
          style={{
            width: 580,
            borderRadius: 'var(--radius-lg)',
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Index Media Library</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              Non-blocking multi-threaded scanning, header-only EXIF/GPS parsing, and batch SQLite ingestion.
            </p>
          </div>

          {/* Error Alert Banner */}
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertTriangle size={16} color="var(--status-danger)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  {errorMessage}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn-secondary"
                  onClick={() => setShowDiagnostics(true)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    gap: 6,
                    color: 'var(--accent-primary)',
                    borderColor: 'var(--surface-glass-border)',
                  }}
                >
                  <Terminal size={12} />
                  View Diagnostic Logs & Report
                </button>
              </div>
            </div>
          )}

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 8,
              }}
            >
              Local Library Directory Path
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => {
                  setFolderPath(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. C:\Users\YourName\Pictures or /Users/yourname/Pictures"
                disabled={isIndexing}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--surface-glass-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              <button
                className="btn-secondary"
                onClick={handleBrowseFolder}
                disabled={isIndexing}
                type="button"
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FolderOpen size={14} />
                Browse...
              </button>
            </div>
          </div>

          {/* Active Progress View */}
          {isIndexing && indexingProgress && (() => {
            const clampedIndexed = Math.min(indexingProgress.indexed_files, indexingProgress.scanned_files);
            const progressPct =
              indexingProgress.scanned_files > 0
                ? Math.min(100, Math.max(0, Math.round((clampedIndexed / indexingProgress.scanned_files) * 100)))
                : 100;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={13} className="animate-spin" color="var(--accent-primary)" />
                    Stage: <strong style={{ textTransform: 'capitalize' }}>{indexingProgress.stage}</strong>
                  </span>

                  {indexingProgress.stage === 'discovering' ? (
                    <span>
                      <strong>{indexingProgress.scanned_files.toLocaleString()}</strong> valid media files found
                    </span>
                  ) : (
                    <span>
                      <strong>{clampedIndexed.toLocaleString()}</strong> / {indexingProgress.scanned_files.toLocaleString()} files ({progressPct}%)
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: 8,
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  {indexingProgress.stage === 'discovering' ? (
                    <div className="progress-indeterminate" />
                  ) : (
                    <div
                      style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: 'var(--accent-gradient)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  )}
                </div>

                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={indexingProgress.current_directory}
                >
                  {indexingProgress.stage === 'discovering' ? 'Scanning folder: ' : 'Processing: '}
                  {indexingProgress.current_directory}
                </div>
              </div>
            );
          })()}

          {/* Footer Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => setShowDiagnostics(true)}
              style={{
                fontSize: '0.75rem',
                padding: '6px 10px',
                gap: 5,
                color: 'var(--text-muted)',
                border: 'none',
                background: 'transparent',
              }}
            >
              <Terminal size={13} />
              Logs & Diagnostics
            </button>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn-secondary" onClick={onClose}>
                {isIndexing ? 'Hide' : 'Close'}
              </button>
              {isIndexing ? (
                <button
                  className="btn-secondary"
                  onClick={handleCancel}
                  style={{ borderColor: 'var(--status-danger)', color: 'var(--status-danger)' }}
                >
                  Cancel Scan
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleStartIndexing}
                  disabled={!folderPath.trim()}
                >
                  Start Indexing
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics Modal */}
      {showDiagnostics && (
        <DiagnosticModal
          onClose={() => setShowDiagnostics(false)}
          initialError={errorMessage}
        />
      )}
    </>
  );
};
