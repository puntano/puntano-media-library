import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Trash2,
  HardDrive,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { DuplicateGroup } from '../../types/media';
import { MediaThumbnail } from '../common/MediaThumbnail';
import { useLibraryStore } from '../../stores/libraryStore';

export const DuplicatesModal: React.FC = () => {
  const { isDuplicateModalOpen, setDuplicateModalOpen, incrementSyncRevision, setTotalMediaCount } = useLibraryStore();
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showAutoCleanConfirm, setShowAutoCleanConfirm] = useState<boolean>(false);
  const [isAutoCleaning, setIsAutoCleaning] = useState<boolean>(false);

  const loadDuplicates = async () => {
    setIsLoading(true);
    try {
      const groups = await tauriApi.queryDuplicateGroups();
      setDuplicateGroups(groups);
    } catch (err) {
      console.error('Failed to load duplicate groups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isDuplicateModalOpen) {
      loadDuplicates();
    }
  }, [isDuplicateModalOpen]);

  if (!isDuplicateModalOpen) return null;

  const totalWastedBytes = duplicateGroups.reduce((acc, g) => {
    const singleSize = g.items[0]?.file_size || 0;
    return acc + singleSize * (g.count - 1);
  }, 0);

  const redundantIds = duplicateGroups.flatMap((g) => g.items.slice(1).map((i) => i.id));

  const handleAutoClean = async (deleteFromDisk: boolean) => {
    if (redundantIds.length === 0 || isAutoCleaning) return;
    setIsAutoCleaning(true);
    try {
      const count = redundantIds.length;
      await tauriApi.batchDeleteMedia(redundantIds, deleteFromDisk);
      setShowAutoCleanConfirm(false);
      setActionMessage(
        deleteFromDisk
          ? `Moved ${count} redundant duplicate ${count === 1 ? 'copy' : 'copies'} to Recycle Bin / Trash`
          : `Removed ${count} redundant duplicate ${count === 1 ? 'copy' : 'copies'} from library index`
      );
      incrementSyncRevision();
      tauriApi.getTotalMediaCount().then(setTotalMediaCount).catch(() => {});
      await loadDuplicates();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      console.error('Failed to auto-clean duplicates:', err);
      setActionMessage(`Error cleaning duplicates: ${String(err)}`);
    } finally {
      setIsAutoCleaning(false);
    }
  };

  const handleDeleteCopy = async (itemId: number, filePath: string) => {
    if (
      !confirm(
        `Move this duplicate copy to the Recycle Bin / Trash?\n\nFile: ${filePath}\n\nThe primary copy will remain untouched in your library.`
      )
    ) {
      return;
    }

    try {
      await tauriApi.deleteMediaFile(itemId, true);
      setActionMessage(`Moved duplicate copy to Trash: ${filePath.split(/[/\\]/).pop()}`);
      incrementSyncRevision();
      tauriApi.getTotalMediaCount().then(setTotalMediaCount).catch(() => {});
      await loadDuplicates();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      console.error('Failed to delete duplicate:', err);
      setActionMessage(`Error deleting file: ${String(err)}`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: 860,
          maxHeight: '88vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Copy size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 10 }}>
                Duplicate Files Cleaner
                {duplicateGroups.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#fca5a5',
                      fontWeight: 600,
                    }}
                  >
                    {duplicateGroups.length} duplicate {duplicateGroups.length === 1 ? 'cluster' : 'clusters'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Identical media detected by content hash (xxHash64 / BLAKE3)
              </div>
            </div>
          </div>

          <button
            onClick={() => setDuplicateModalOpen(false)}
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

        {/* Action Status Banner */}
        {actionMessage && (
          <div
            style={{
              padding: '10px 24px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--text-primary)',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={15} color="var(--status-success)" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary Card */}
          <div
            className="glass-panel"
            style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <HardDrive size={24} color="var(--accent-primary)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Wasted Storage Recoverable
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Storage occupied by redundant identical copies of photos and videos
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171' }}>
                  {(totalWastedBytes / (1024 * 1024)).toFixed(1)} MB
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  across {redundantIds.length} redundant {redundantIds.length === 1 ? 'copy' : 'copies'}
                </div>
              </div>
              {redundantIds.length > 0 && (
                <button
                  className="btn-primary"
                  onClick={() => setShowAutoCleanConfirm(true)}
                  disabled={isAutoCleaning}
                  style={{
                    padding: '8px 14px',
                    fontSize: '0.8rem',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Sparkles size={14} />
                  Keep 1 Copy Per Cluster ({redundantIds.length})
                </button>
              )}
            </div>
          </div>

          {showAutoCleanConfirm && (
            <div
              className="glass-panel"
              style={{
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#fca5a5' }}>
                  <AlertTriangle size={16} />
                  Auto-Clean {redundantIds.length} Redundant Duplicate {redundantIds.length === 1 ? 'Copy' : 'Copies'}
                </div>
                <button
                  onClick={() => setShowAutoCleanConfirm(false)}
                  disabled={isAutoCleaning}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={15} />
                </button>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                The primary copy in each of the {duplicateGroups.length} duplicate clusters will be kept safe. How would you like to clean the {redundantIds.length} redundant copies?
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  className="btn-secondary"
                  disabled={isAutoCleaning}
                  onClick={() => setShowAutoCleanConfirm(false)}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  Cancel
                </button>
                <button
                  className="btn-secondary"
                  disabled={isAutoCleaning}
                  onClick={() => handleAutoClean(false)}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  Remove from Library Index Only
                </button>
                <button
                  disabled={isAutoCleaning}
                  onClick={() => handleAutoClean(true)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    cursor: isAutoCleaning ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Trash2 size={13} />
                  {isAutoCleaning ? 'Cleaning...' : 'Move Redundant Copies to Trash'}
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Analyzing database for exact file hash duplicates...
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div
              className="glass-panel"
              style={{
                padding: '48px 24px',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <ShieldCheck size={44} color="var(--status-success)" />
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>No Duplicates Found!</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 420 }}>
                Every photo and video in your indexed libraries has a unique content hash. Your library is 100% clean.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {duplicateGroups.map((group, groupIdx) => (
                <div
                  key={group.file_hash}
                  className="glass-panel"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--surface-glass-border)',
                  }}
                >
                  {/* Cluster Header */}
                  <div
                    style={{
                      padding: '10px 16px',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      borderBottom: '1px solid var(--surface-glass-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      Cluster #{groupIdx + 1} • {group.count} Identical Copies
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Hash: {group.file_hash.slice(0, 12)}... •{' '}
                      {((group.items[0]?.file_size || 0) / (1024 * 1024)).toFixed(2)} MB each
                    </span>
                  </div>

                  {/* List of Duplicate Items */}
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {group.items.map((item, itemIdx) => {
                      const isFirst = itemIdx === 0;
                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 14,
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isFirst ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                            border: isFirst ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 4,
                                overflow: 'hidden',
                                flexShrink: 0,
                                backgroundColor: '#000',
                              }}
                            >
                              <MediaThumbnail
                                filePath={item.file_path}
                                fileHash={item.file_hash}
                                mediaType={item.media_type}
                                alt={item.file_name}
                              />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.file_name}</span>
                                {isFirst && (
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      backgroundColor: 'var(--accent-primary)',
                                      color: '#fff',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Primary Copy
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.72rem',
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: 2,
                                }}
                                title={item.file_path}
                              >
                                {item.file_path}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <button
                              className="btn-secondary"
                              onClick={() => tauriApi.showInFolder(item.file_path)}
                              title="Show in File Explorer"
                              style={{ padding: '5px 8px', fontSize: '0.72rem' }}
                            >
                              <ExternalLink size={13} />
                            </button>
                            {!isFirst && (
                              <button
                                className="btn-secondary"
                                onClick={() => handleDeleteCopy(item.id, item.file_path)}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.72rem',
                                  color: '#f87171',
                                  borderColor: 'rgba(239, 68, 68, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                }}
                              >
                                <Trash2 size={13} />
                                Delete Copy
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <button
            className="btn-secondary"
            onClick={() => setDuplicateModalOpen(false)}
            style={{ padding: '6px 16px', fontSize: '0.85rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
