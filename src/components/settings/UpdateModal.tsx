import React from 'react';
import {
  X,
  Download,
  Sparkles,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useUpdaterStore } from '../../stores/updaterStore';
import { useLibraryStore } from '../../stores/libraryStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          style={{
            padding: '1px 5px',
            borderRadius: 4,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.76rem',
            color: '#93c5fd',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderReleaseNotes(notes?: string): React.ReactNode {
  if (!notes || !notes.trim()) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        Performance improvements, stability enhancements, and bug fixes.
      </div>
    );
  }

  const lines = notes.split(/\r?\n/);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} style={{ height: 4 }} />;
        }

        if (trimmed.startsWith('## ')) {
          return (
            <div
              key={idx}
              style={{
                fontWeight: 700,
                fontSize: '0.9rem',
                color: '#ffffff',
                marginTop: idx === 0 ? 0 : 8,
              }}
            >
              {renderInlineMarkdown(trimmed.slice(3))}
            </div>
          );
        }

        if (trimmed.startsWith('### ')) {
          return (
            <div
              key={idx}
              style={{
                fontWeight: 600,
                fontSize: '0.82rem',
                color: 'var(--accent-primary)',
                marginTop: idx === 0 ? 0 : 6,
              }}
            >
              {renderInlineMarkdown(trimmed.slice(4))}
            </div>
          );
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const isNested = line.startsWith('  ') || line.startsWith('\t');
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                paddingLeft: isNested ? 18 : 4,
                fontSize: '0.8rem',
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ color: 'var(--accent-primary)', marginTop: 1 }}>•</span>
              <span style={{ flex: 1 }}>{renderInlineMarkdown(trimmed.slice(2))}</span>
            </div>
          );
        }

        return (
          <div
            key={idx}
            style={{
              fontSize: '0.8rem',
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
            }}
          >
            {renderInlineMarkdown(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

export const UpdateModal: React.FC = () => {
  const {
    status,
    updateInfo,
    downloadProgress,
    errorMessage,
    isUpdateModalOpen,
    installUpdate,
    dismissUpdatePrompt,
    setUpdateModalOpen,
    openReleaseInBrowser,
  } = useUpdaterStore();
  const { isIndexing } = useLibraryStore();

  if (!isUpdateModalOpen || !updateInfo) return null;

  const isBusy =
    status === 'downloading' || status === 'installing' || status === 'restarting';

  const formattedDate = updateInfo.date
    ? (() => {
        const parsed = new Date(updateInfo.date);
        return Number.isNaN(parsed.getTime())
          ? null
          : parsed.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
      })()
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 130,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: 600,
          maxWidth: '92vw',
          maxHeight: '86vh',
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
            padding: '18px 24px',
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
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                Software Update Available
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Puntano Media Library v{updateInfo.version} is ready to install
              </div>
            </div>
          </div>

          {!isBusy && (
            <button
              onClick={() => setUpdateModalOpen(false)}
              title="Close"
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
          )}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Version Summary Strip */}
          <div
            className="glass-panel"
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(255, 255, 255, 0.07)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                v{updateInfo.currentVersion}
              </span>
              <ArrowRight size={14} color="var(--text-muted)" />
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'var(--accent-gradient)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                v{updateInfo.version}
              </span>
              {formattedDate && (
                <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                  • Released {formattedDate}
                </span>
              )}
            </div>

            {updateInfo.canInstallInApp && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.72rem',
                  color: '#10b981',
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={14} />
                Signed & Verified
              </div>
            )}
          </div>

          {/* Active Indexing Warning */}
          {isIndexing && !isBusy && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: '0.78rem',
                color: '#fde68a',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} color="#f59e0b" />
              <span>
                A folder indexing scan is currently running. Installing now will safely stop the
                active scan and checkpoint SQLite before restarting, or you can click{' '}
                <strong>Remind Me Later</strong> until indexing finishes.
              </span>
            </div>
          )}

          {/* Release Notes Box */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-secondary)',
                }}
              >
                Release Notes
              </span>
              <button
                onClick={openReleaseInBrowser}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                View on GitHub
                <ExternalLink size={12} />
              </button>
            </div>

            <div
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(0, 0, 0, 0.28)',
                border: '1px solid var(--surface-glass-border)',
              }}
            >
              {renderReleaseNotes(updateInfo.body)}
            </div>
          </div>

          {/* Live Download & Install Progress */}
          {isBusy && (
            <div
              className="glass-panel"
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={14} className="animate-spin" color="var(--accent-primary)" />
                  {status === 'downloading' && 'Downloading signed update package...'}
                  {status === 'installing' && 'Verifying signature & installing update...'}
                  {status === 'restarting' && 'Restarting Puntano Media Library...'}
                </span>
                <span style={{ color: 'var(--accent-primary)' }}>
                  {status === 'downloading' && downloadProgress.totalBytes
                    ? `${downloadProgress.percent}%`
                    : status !== 'downloading'
                    ? '100%'
                    : ''}
                </span>
              </div>

              <div
                style={{
                  width: '100%',
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  className={
                    status === 'downloading' && !downloadProgress.totalBytes
                      ? 'progress-indeterminate'
                      : undefined
                  }
                  style={
                    status === 'downloading' && !downloadProgress.totalBytes
                      ? { height: '100%', borderRadius: 999 }
                      : {
                          width: `${
                            status === 'downloading' ? downloadProgress.percent : 100
                          }%`,
                          height: '100%',
                          borderRadius: 999,
                          background: 'var(--accent-gradient)',
                          transition: 'width 0.15s ease',
                        }
                  }
                />
              </div>

              {status === 'downloading' && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {formatBytes(downloadProgress.downloadedBytes)}
                  {downloadProgress.totalBytes
                    ? ` of ${formatBytes(downloadProgress.totalBytes)}`
                    : ' downloaded'}
                </div>
              )}
            </div>
          )}

          {/* Error Banner with Fallback */}
          {status === 'error' && errorMessage && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: '0.78rem',
                color: '#fca5a5',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} color="#ef4444" />
                <span>{errorMessage}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 23 }}>
                <button
                  className="btn-secondary"
                  onClick={openReleaseInBrowser}
                  style={{ padding: '4px 10px', fontSize: '0.74rem', gap: 5 }}
                >
                  <ExternalLink size={12} />
                  Download Installer Manually
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--surface-glass-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            gap: 12,
          }}
        >
          <button
            className="btn-secondary"
            onClick={dismissUpdatePrompt}
            disabled={isBusy}
            style={{
              padding: '7px 14px',
              fontSize: '0.82rem',
              opacity: isBusy ? 0.5 : 1,
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            Remind Me Later
          </button>

          <button
            className="btn-primary"
            onClick={installUpdate}
            disabled={isBusy}
            style={{
              padding: '8px 18px',
              fontSize: '0.84rem',
              gap: 7,
              opacity: isBusy ? 0.75 : 1,
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {isBusy ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {status === 'downloading'
                  ? 'Downloading...'
                  : status === 'installing'
                  ? 'Installing...'
                  : 'Restarting...'}
              </>
            ) : status === 'error' ? (
              <>
                <RefreshCw size={15} />
                Retry Install
              </>
            ) : updateInfo.canInstallInApp ? (
              <>
                <Download size={15} />
                Install & Restart
              </>
            ) : (
              <>
                <ExternalLink size={15} />
                Download from GitHub
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
