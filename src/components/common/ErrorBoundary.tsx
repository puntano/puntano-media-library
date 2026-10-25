import React from 'react';
import { AlertTriangle, RefreshCw, Terminal } from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { DiagnosticModal } from '../settings/DiagnosticModal';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
  showDiagnostics: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
      showDiagnostics: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || String(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const details = `${error?.name || 'Error'}: ${error?.message || String(error)} | Stack: ${
      error?.stack || 'n/a'
    } | ComponentStack: ${errorInfo?.componentStack || 'n/a'}`;
    console.error('[ErrorBoundary]', error, errorInfo);
    tauriApi.logFrontendEvent('fatal', 'ReactErrorBoundary', details);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          padding: 24,
        }}
      >
        <div
          className="glass-panel"
          style={{
            maxWidth: 520,
            width: '100%',
            borderRadius: 'var(--radius-lg)',
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={24} color="var(--status-danger)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Unexpected UI Error</h2>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Puntano encountered a rendering error. The error details have been recorded to your diagnostic log so
            nothing in your media database was lost.
          </p>

          {this.state.errorMessage && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#fca5a5',
                wordBreak: 'break-word',
              }}
            >
              {this.state.errorMessage}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button
              className="btn-secondary"
              onClick={() => this.setState({ showDiagnostics: true })}
              style={{ gap: 6 }}
            >
              <Terminal size={14} />
              View Diagnostics
            </button>
            <button
              className="btn-primary"
              onClick={() => window.location.reload()}
              style={{ gap: 6 }}
            >
              <RefreshCw size={14} />
              Reload App
            </button>
          </div>
        </div>

        {this.state.showDiagnostics && (
          <DiagnosticModal
            onClose={() => this.setState({ showDiagnostics: false })}
            initialError={this.state.errorMessage}
          />
        )}
      </div>
    );
  }
}
