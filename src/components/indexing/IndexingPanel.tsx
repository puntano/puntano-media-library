import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useLibraryStore } from '../../stores/libraryStore';
import { tauriApi, isTauri } from '../../services/tauriApi';

export const IndexingPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [folderPath, setFolderPath] = useState('');
  const { isIndexing, setIsIndexing, indexingProgress, setIndexingProgress, setTotalMediaCount } =
    useLibraryStore();

  const handleBrowseFolder = async () => {
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
    if (!folderPath.trim()) return;
    setIsIndexing(true);

    try {
      // Listen for throttled progress events from the Rust pipeline
      const unlisten = await tauriApi.onIndexingProgress((progress) => {
        setIndexingProgress(progress);
        if (progress.is_complete) {
          setIsIndexing(false);
          tauriApi.getTotalMediaCount().then((count) => setTotalMediaCount(count));
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
          width: 560,
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

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Local Library Directory Path
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
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
              style={{ whiteSpace: 'nowrap' }}
            >
              📁 Browse...
            </button>
          </div>
        </div>

        {isIndexing && indexingProgress && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>
                Stage: <strong style={{ textTransform: 'capitalize' }}>{indexingProgress.stage}</strong>
              </span>
              <span>
                {indexingProgress.indexed_files.toLocaleString()} files indexed (
                {((indexingProgress.indexed_files / Math.max(1, indexingProgress.scanned_files)) * 100).toFixed(0)}%)
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
