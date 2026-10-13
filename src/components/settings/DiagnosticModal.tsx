import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  FileText,
  Copy,
  Check,
  FolderOpen,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Terminal,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { DiagnosticReport } from '../../types/media';

interface DiagnosticModalProps {
  onClose: () => void;
  initialError?: string | null;
}

export const DiagnosticModal: React.FC<DiagnosticModalProps> = ({ onClose, initialError }) => {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'errors' | 'warnings'>('all');
  const logTerminalRef = useRef<HTMLDivElement>(null);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    try {
      const data = await tauriApi.getDiagnosticReport();
      setReport(data);
      setLogs(data.recent_logs || []);
    } catch (err) {
      console.error('Failed to load diagnostic report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs, logFilter]);

  const handleCopyReport = async () => {
    if (!report) return;

    const filteredLogsText = logs.slice(-50).join('\n');
    const md = `### Puntano Media Library Diagnostic Report
- **App Version**: ${report.app_version}
- **Operating System**: ${report.os_name} (${report.os_family}, ${report.arch})
- **Database Path**: \`${report.db_path}\`
- **Database Size**: ${(report.db_size_bytes / (1024 * 1024)).toFixed(2)} MB
- **Log File**: \`${report.log_file_path}\`
- **Total Registered Libraries**: ${report.total_libraries}
- **Total Indexed Files**: ${report.total_media_files}
${initialError ? `\n### Error Encountered:\n\`\`\`\n${initialError}\n\`\`\`\n` : ''}
### Recent Diagnostic Logs:
\`\`\`
${filteredLogsText}
\`\`\`
`;

    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await tauriApi.openLogFolder();
    } catch (err) {
      console.error('Failed to open log folder:', err);
    }
  };

  const handleOpenGitHubIssue = () => {
    const title = encodeURIComponent(
      initialError
        ? `[Bug] Indexing failure: ${initialError.slice(0, 50)}`
        : '[Bug] Issue Report with Diagnostics'
    );
    const bodyHeader = encodeURIComponent(
      `**Description**:\n(Please describe what happened)\n\n**Environment**:\n- OS: ${report?.os_name || 'Windows'}\n- Version: ${report?.app_version || 'v0.3.0'}\n\n**Logs**:\n(Click "Copy Diagnostic Report" in app and paste here)`
    );
    window.open(
      `https://github.com/puntano/puntano-media-library/issues/new?title=${title}&body=${bodyHeader}`,
      '_blank'
    );
  };

  const filteredLogs = logs.filter((line) => {
    if (logFilter === 'errors') {
      return line.includes('[ERROR') || line.includes('[FATAL');
    }
    if (logFilter === 'warnings') {
      return line.includes('[WARN') || line.includes('[ERROR') || line.includes('[FATAL');
    }
    return true;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: 760,
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
            height: 60,
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
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
              }}
            >
              <Terminal size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Diagnostics & System Logs</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Troubleshooting data, crash prevention, and logs
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

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* If opened due to an indexing error, display alert banner */}
          {initialError && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <AlertTriangle size={18} color="var(--status-danger)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--status-danger)' }}>
                  Reported Issue:
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: 2, fontFamily: 'monospace' }}>
                  {initialError}
                </div>
              </div>
            </div>
          )}

          {/* System Spec Cards */}
          {report && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div
                className="glass-panel"
                style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Cpu size={12} /> OS & Architecture
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: 4, textTransform: 'capitalize' }}>
                  {report.os_name} ({report.arch})
                </div>
              </div>

              <div
                className="glass-panel"
                style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <HardDrive size={12} /> Database Size
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: 4 }}>
                  {(report.db_size_bytes / (1024 * 1024)).toFixed(1)} MB
                </div>
              </div>

              <div
                className="glass-panel"
                style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>App Version</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: 4, color: 'var(--accent-primary)' }}>
                  v{report.app_version}
                </div>
              </div>

              <div
                className="glass-panel"
                style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Indexed Files</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: 4 }}>
                  {report.total_media_files.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Log File Location Box */}
          {report?.log_file_path && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                border: '1px solid var(--surface-glass-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <FileText size={14} color="var(--text-muted)" />
                <span style={{ color: 'var(--text-muted)' }}>Active Log File:</span>
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={report.log_file_path}
                >
                  {report.log_file_path}
                </span>
              </div>
              <button
                className="btn-secondary"
                onClick={handleOpenFolder}
                style={{ padding: '4px 8px', fontSize: '0.7rem', marginLeft: 8, whiteSpace: 'nowrap', gap: 4 }}
              >
                <FolderOpen size={12} />
                Open Folder
              </button>
            </div>
          )}

          {/* Log Viewer Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setLogFilter('all')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: logFilter === 'all' ? 'var(--accent-primary)' : 'var(--surface-glass-border)',
                    backgroundColor: logFilter === 'all' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    color: logFilter === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  All Logs ({logs.length})
                </button>
                <button
                  onClick={() => setLogFilter('warnings')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: logFilter === 'warnings' ? 'var(--accent-primary)' : 'var(--surface-glass-border)',
                    backgroundColor: logFilter === 'warnings' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    color: logFilter === 'warnings' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Warnings & Errors
                </button>
                <button
                  onClick={() => setLogFilter('errors')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: logFilter === 'errors' ? 'var(--status-danger)' : 'var(--surface-glass-border)',
                    backgroundColor: logFilter === 'errors' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                    color: logFilter === 'errors' ? 'var(--status-danger)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Errors Only
                </button>
              </div>

              <button
                className="btn-secondary"
                onClick={fetchDiagnostics}
                disabled={isLoading}
                style={{ padding: '3px 8px', fontSize: '0.7rem', gap: 4 }}
              >
                <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {/* Terminal Window */}
            <div
              ref={logTerminalRef}
              style={{
                height: 240,
                backgroundColor: 'rgba(10, 15, 26, 0.9)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                overflowY: 'auto',
                fontFamily: 'Consolas, "Fira Code", monospace',
                fontSize: '0.72rem',
                lineHeight: 1.5,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)',
              }}
            >
              {filteredLogs.length === 0 ? (
                <div style={{ color: '#64748b', fontStyle: 'italic', padding: 8 }}>
                  No matching log entries found.
                </div>
              ) : (
                filteredLogs.map((line, idx) => {
                  let color = '#94a3b8';
                  if (line.includes('[ERROR') || line.includes('[FATAL')) {
                    color = '#f87171';
                  } else if (line.includes('[WARN')) {
                    color = '#fbbf24';
                  } else if (line.includes('[INFO')) {
                    color = '#38bdf8';
                  }
                  return (
                    <div key={idx} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {line}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer with Report Actions */}
        <div
          style={{
            height: 64,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--surface-glass-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-primary"
              onClick={handleCopyReport}
              style={{ padding: '8px 14px', fontSize: '0.8rem', gap: 6 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied to Clipboard!' : 'Copy Diagnostic Report'}
            </button>

            <button
              className="btn-secondary"
              onClick={handleOpenGitHubIssue}
              style={{ padding: '8px 14px', fontSize: '0.8rem', gap: 6 }}
            >
              <ExternalLink size={14} />
              Report Issue on GitHub
            </button>
          </div>

          <button
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '0.85rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
