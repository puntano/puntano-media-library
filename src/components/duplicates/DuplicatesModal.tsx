import React, { useEffect, useMemo, useState } from 'react';
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
  Search,
} from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { DuplicateGroup, MediaItem } from '../../types/media';
import { MediaThumbnail } from '../common/MediaThumbnail';
import { useLibraryStore } from '../../stores/libraryStore';

// Evaluates which copy in a duplicate cluster is the canonical original
function getKeeperScore(item: MediaItem): number {
  let score = 100;
  const name = item.file_name.toLowerCase();
  const path = item.file_path.toLowerCase();

  // Penalize duplicate suffixes
  if (/\(\d+\)/.test(name)) score -= 45;
  if (name.includes('-edited')) score -= 35;
  if (name.includes('copy') || name.includes('copia')) score -= 30;

  // Penalize temporary or export folders
  if (path.includes('takeout')) score -= 25;
  if (path.includes('export') || path.includes('temp') || path.includes('backup')) score -= 20;

  // Reward richer metadata
  if (item.latitude != null) score += 30;
  if (item.captured_at != null) score += 20;
  if (item.camera_make != null) score += 15;
  if (item.is_favorite) score += 50;
  if (item.rating > 0) score += item.rating * 10;

  return score;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const DuplicatesModal: React.FC = () => {
  const { isDuplicateModalOpen, setDuplicateModalOpen, incrementSyncRevision, setTotalMediaCount } =
    useLibraryStore();
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showAutoCleanConfirm, setShowAutoCleanConfirm] = useState<boolean>(false);
  const [isAutoCleaning, setIsAutoCleaning] = useState<boolean>(false);

  // Filters
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'photo' | 'video'>('all');
  const [minSizeFilter, setMinSizeFilter] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [displayCount, setDisplayCount] = useState<number>(60);

  const loadDuplicates = async () => {
    setIsLoading(true);
    try {
      const minBytes = minSizeFilter > 0 ? minSizeFilter : undefined;
      const mType = mediaTypeFilter !== 'all' ? mediaTypeFilter : undefined;
      const rawGroups = await tauriApi.queryDuplicateGroups(minBytes, mType);

      // Re-order items in each cluster so the highest-scoring canonical copy is at index 0
      const rankedGroups = rawGroups.map((g) => {
        const sortedItems = [...g.items].sort((a, b) => getKeeperScore(b) - getKeeperScore(a));
        return {
          ...g,
          items: sortedItems,
        };
      });

      setDuplicateGroups(rankedGroups);
      setDisplayCount(60);
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
  }, [isDuplicateModalOpen, mediaTypeFilter, minSizeFilter]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return duplicateGroups;
    const q = searchQuery.toLowerCase();
    return duplicateGroups.filter((g) =>
      g.items.some(
        (i) => i.file_name.toLowerCase().includes(q) || i.file_path.toLowerCase().includes(q)
      )
    );
  }, [duplicateGroups, searchQuery]);

  if (!isDuplicateModalOpen) return null;

  const totalWastedBytes = filteredGroups.reduce((acc, g) => {
    const singleSize = g.items[0]?.file_size || 0;
    return acc + singleSize * (g.count - 1);
  }, 0);

  const redundantIds = filteredGroups.flatMap((g) => g.items.slice(1).map((i) => i.id));

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
        `Move this duplicate copy to the Recycle Bin / Trash?\n\nFile: ${filePath}\n\nThe primary canonical copy will remain untouched in your library.`
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

  const visibleGroups = filteredGroups.slice(0, displayCount);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
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
          width: 920,
          maxHeight: '90vh',
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
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Copy size={19} />
            </div>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  letterSpacing: '-0.01em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                Duplicate Files Cleaner
                {filteredGroups.length > 0 && (
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
                    {filteredGroups.length} {filteredGroups.length === 1 ? 'cluster' : 'clusters'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Identical media detected by content hash (xxHash64) across all folders
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

        {/* Controls & Filter Bar */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid var(--surface-glass-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Filter by filename or folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 32px',
                fontSize: '0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--surface-glass-border)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Type:</span>
            {(['all', 'photo', 'video'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setMediaTypeFilter(type)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border:
                    mediaTypeFilter === type
                      ? '1px solid var(--accent-primary)'
                      : '1px solid var(--surface-glass-border)',
                  backgroundColor:
                    mediaTypeFilter === type
                      ? 'rgba(59, 130, 246, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                  color:
                    mediaTypeFilter === type ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Min Size Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min Size:</span>
            {[
              { label: 'All', bytes: 0 },
              { label: '> 1 MB', bytes: 1024 * 1024 },
              { label: '> 10 MB', bytes: 10 * 1024 * 1024 },
              { label: '> 50 MB', bytes: 50 * 1024 * 1024 },
            ].map(({ label, bytes }) => (
              <button
                key={label}
                onClick={() => setMinSizeFilter(bytes)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border:
                    minSizeFilter === bytes
                      ? '1px solid var(--accent-primary)'
                      : '1px solid var(--surface-glass-border)',
                  backgroundColor:
                    minSizeFilter === bytes
                      ? 'rgba(59, 130, 246, 0.2)'
                      : 'rgba(255, 255, 255, 0.03)',
                  color:
                    minSizeFilter === bytes ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
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
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <HardDrive size={26} color="var(--accent-primary)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                  Wasted Storage Recoverable
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Identified across {filteredGroups.length} duplicate clusters (prioritizing
                  clean originals)
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f87171' }}>
                  {formatBytes(totalWastedBytes)}
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
                    padding: '8px 16px',
                    fontSize: '0.825rem',
                    gap: 8,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Sparkles size={15} />
                  Keep Best Copy ({redundantIds.length} to Trash)
                </button>
              )}
            </div>
          </div>

          {showAutoCleanConfirm && (
            <div
              className="glass-panel"
              style={{
                padding: '18px 22px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                backgroundColor: 'rgba(239, 68, 68, 0.09)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    color: '#fca5a5',
                  }}
                >
                  <AlertTriangle size={17} />
                  Clean {redundantIds.length} Redundant Duplicate Copies ({formatBytes(totalWastedBytes)})
                </div>
                <button
                  onClick={() => setShowAutoCleanConfirm(false)}
                  disabled={isAutoCleaning}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={15} />
                </button>
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                Our algorithm will keep the <strong>primary canonical copy</strong> in each
                cluster (prioritizing original names, root folders, and rich EXIF/GPS metadata).
                Redundant copies with <code>(1)</code>, <code>-edited</code>, or in backup folders
                will be moved to your OS Recycle Bin / Trash so they can always be restored if
                desired.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  className="btn-secondary"
                  disabled={isAutoCleaning}
                  onClick={() => setShowAutoCleanConfirm(false)}
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  className="btn-secondary"
                  disabled={isAutoCleaning}
                  onClick={() => handleAutoClean(false)}
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  Remove from Index Only
                </button>
                <button
                  disabled={isAutoCleaning}
                  onClick={() => handleAutoClean(true)}
                  style={{
                    padding: '6px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    backgroundColor: 'rgba(239, 68, 68, 0.25)',
                    color: '#fca5a5',
                    cursor: isAutoCleaning ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Trash2 size={14} />
                  {isAutoCleaning ? 'Cleaning...' : 'Move Redundant Copies to Trash'}
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              Analyzing database for duplicate content clusters...
            </div>
          ) : filteredGroups.length === 0 ? (
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
                {searchQuery || mediaTypeFilter !== 'all' || minSizeFilter > 0
                  ? 'No duplicate clusters match your selected filters.'
                  : 'Every photo and video in your indexed libraries has a unique content hash. Your library is 100% clean.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {visibleGroups.map((group, groupIdx) => (
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
                      {formatBytes(group.items[0]?.file_size || 0)} each
                    </span>
                  </div>

                  {/* List of Duplicate Items */}
                  <div
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {group.items.map((item, itemIdx) => {
                      const isKeeper = itemIdx === 0;
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
                            backgroundColor: isKeeper
                              ? 'rgba(59, 130, 246, 0.08)'
                              : 'rgba(255, 255, 255, 0.02)',
                            border: isKeeper
                              ? '1px solid rgba(59, 130, 246, 0.25)'
                              : '1px solid transparent',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              minWidth: 0,
                              flex: 1,
                            }}
                          >
                            <div
                              style={{
                                width: 46,
                                height: 46,
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
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                  {item.file_name}
                                </span>
                                {isKeeper ? (
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '1px 7px',
                                      borderRadius: 4,
                                      backgroundColor: 'rgba(59, 130, 246, 0.85)',
                                      color: '#fff',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Keep (Best Original)
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '1px 7px',
                                      borderRadius: 4,
                                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                      color: '#fca5a5',
                                      fontWeight: 500,
                                    }}
                                  >
                                    Redundant Copy
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

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexShrink: 0,
                            }}
                          >
                            <button
                              className="btn-secondary"
                              onClick={() => tauriApi.showInFolder(item.file_path)}
                              title="Show in File Explorer"
                              style={{ padding: '5px 8px', fontSize: '0.72rem' }}
                            >
                              <ExternalLink size={13} />
                            </button>
                            {!isKeeper && (
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
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {visibleGroups.length < filteredGroups.length && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => setDisplayCount((c) => c + 60)}
                    style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                  >
                    Load More Clusters (Showing {visibleGroups.length} of {filteredGroups.length})
                  </button>
                </div>
              )}
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
            justifyContent: 'space-between',
            borderTop: '1px solid var(--surface-glass-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Showing {visibleGroups.length} of {filteredGroups.length} duplicate clusters
          </div>
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
