import React, { useState } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import { tauriApi } from '../../services/tauriApi';

export const IndexingPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [folderPath, setFolderPath] = useState('');
  const { isIndexing, setIsIndexing, indexingProgress, setIndexingProgress } = useLibraryStore();

  const handleStartIndexing = async () => {
    if (!folderPath.trim()) return;
    setIsIndexing(true);

    try {
      // Listen for throttled progress events from the Rust pipeline
      const unlisten = await tauriApi.onIndexingProgress((progress) => {
        setIndexingProgress(progress);
        if (progress.is_complete) {
          setIsIndexing(false);
          unlisten();
        }
      });

      await tauriApi.startIndexing(folderPath.trim());
    } catch (err) {
      console.error('Indexing failed:', err);
      setIsIndexing(false);
    }
  };

  const handleCancel = async () => {
    await tauriApi.cancelIndexing();
    setIsIndexing(false);
  };

  return (
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
          width: 540,
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
            Non-blocking multi-threaded scanning, EXIF/GPS parsing, and batch database ingestion.
          </p>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Local Library Directory Path
          </label>
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="e.g. C:\Users\YourName\Pictures or /Users/yourname/Pictures"
            disabled={isIndexing}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--surface-glass-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
        </div>

        {isIndexing && indexingProgress && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Stage: <strong>{indexingProgress.stage}</strong></span>
              <span>
                {indexingProgress.indexed_files.toLocaleString()} files indexed ({((indexingProgress.indexed_files / Math.max(1, indexingProgress.scanned_files)) * 100).toFixed(0)}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: 8, backgroundColor: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (indexingProgress.indexed_files / Math.max(1, indexingProgress.scanned_files)) * 100)}%`,
                  background: 'var(--accent-gradient)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Current directory: {indexingProgress.current_directory}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <button className="btn-secondary" onClick={onClose} disabled={isIndexing}>
            Close
          </button>
          {isIndexing ? (
            <button className="btn-secondary" onClick={handleCancel} style={{ borderColor: 'var(--status-danger)', color: 'var(--status-danger)' }}>
              Cancel Scan
            </button>
          ) : (
            <button className="btn-primary" onClick={handleStartIndexing} disabled={!folderPath.trim()}>
              Start Indexing
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
