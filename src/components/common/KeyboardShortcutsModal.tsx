import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { useLibraryStore } from '../../stores/libraryStore';

interface ShortcutGroup {
  category: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Global & Navigation',
    shortcuts: [
      { keys: ['1'], description: 'Switch to Map View' },
      { keys: ['2'], description: 'Switch to Timeline View' },
      { keys: ['3'], description: 'Switch to Gallery View' },
      { keys: ['4'], description: 'Switch to Albums View' },
      { keys: ['?'], description: 'Toggle this Shortcuts reference' },
      { keys: ['Esc'], description: 'Close modal, drawer, or lightbox' },
    ],
  },
  {
    category: 'Gallery & Multi-Selection',
    shortcuts: [
      { keys: ['Ctrl', 'A'], description: 'Select all visible items in Gallery' },
      { keys: ['Esc'], description: 'Clear selection / Exit selection mode' },
      { keys: ['3', '—', '8'], description: 'Adjust grid column density' },
    ],
  },
  {
    category: 'Lightbox Fullscreen Viewer',
    shortcuts: [
      { keys: ['←', '→'], description: 'Navigate Previous / Next media item' },
      { keys: ['Space'], description: 'Play / Pause video playback' },
      { keys: ['+', '—'], description: 'Zoom in / Zoom out' },
      { keys: ['0'], description: 'Reset zoom to 100%' },
      { keys: ['I'], description: 'Open Inspector for current item' },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC = () => {
  const { isShortcutsModalOpen, setShortcutsModalOpen } = useLibraryStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isShortcutsModalOpen) {
        setShortcutsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortcutsModalOpen, setShortcutsModalOpen]);

  if (!isShortcutsModalOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={() => setShortcutsModalOpen(false)}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 600,
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--surface-glass-border)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--surface-glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Keyboard size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Keyboard Shortcuts</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Speed up your media curation and navigation
              </p>
            </div>
          </div>
          <button
            onClick={() => setShortcutsModalOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcuts Body */}
        <div style={{ padding: '20px 24px', maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category}>
              <h4
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  marginBottom: 10,
                }}
              >
                {group.category}
              </h4>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                {group.shortcuts.map((sc, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>{sc.description}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {sc.keys.map((k, ki) => (
                        <kbd
                          key={ki}
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            minWidth: 24,
                            textAlign: 'center',
                            fontSize: '0.72rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: '#ffffff',
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '4px',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: 'rgba(0, 0, 0, 0.15)',
            borderTop: '1px solid var(--surface-glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>Press <kbd style={{ padding: '2px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>?</kbd> anytime to open</span>
          <button
            className="btn-secondary"
            onClick={() => setShortcutsModalOpen(false)}
            style={{ padding: '4px 12px', fontSize: '0.75rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
