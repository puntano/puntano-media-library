import React, { useEffect, useState } from 'react';
import { tauriApi } from '../../services/tauriApi';
import { TimelineGroup } from '../../types/media';

export const TimelineView: React.FC = () => {
  const [groups, setGroups] = useState<TimelineGroup[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  useEffect(() => {
    tauriApi.queryTimelineGroups().then((data) => {
      setGroups(data);
      if (data.length > 0) {
        setSelectedPeriod(data[0].period);
      }
    });
  }, []);

  const totalTimelineFiles = groups.reduce((acc, g) => acc + g.count, 0);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Left Timeline Date Scrubber & Sidebar */}
      <div
        className="glass-panel"
        style={{
          width: 320,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--surface-glass-border)',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--surface-glass-border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Chronological Archive
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            {totalTimelineFiles.toLocaleString()} Items
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Indexed by DateTimeOriginal
          </div>
        </div>

        {/* Chronological List of Months / Periods */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {groups.map((group) => {
            const isSelected = group.period === selectedPeriod;
            return (
              <div
                key={group.period}
                onClick={() => setSelectedPeriod(group.period)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 6,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--surface-glass-hover)' : 'transparent',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {group.period}
                  </div>
                </div>
                <div
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {group.count.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Period Content Area */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {selectedPeriod ? `Media from ${selectedPeriod}` : 'Chronological Timeline'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Fast B-Tree range query executed directly against SQLite
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel"
              style={{
                aspectRatio: '1',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(180deg, rgba(30, 41, 67, 0.4) 0%, rgba(16, 21, 34, 0.8) 100%)',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Thumbnail #{i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
