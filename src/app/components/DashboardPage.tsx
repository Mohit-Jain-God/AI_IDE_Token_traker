import { useState, useEffect, useCallback, useRef } from 'react';
import type { Account, LogEntry, SystemSnapshot } from './types';
import { MOCK_ACCOUNTS, MOCK_SNAPSHOT, MOCK_LOGS } from './mockData';
import { AccountCard } from './AccountCard';

const SERVER_URL = 'http://127.0.0.1:9876';
const POLL_INTERVAL = 30_000;

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const LOG_COLORS: Record<LogEntry['type'], string> = {
  SYNC: '#00d4ff',
  EVENT: '#ff3366',
  SWITCH: '#a78bfa',
  RESET: '#00ff88',
  WARN: '#ffaa00',
  ERROR: '#ff3366',
};

const LOG_BG: Record<LogEntry['type'], string> = {
  SYNC: 'rgba(0,212,255,0.06)',
  EVENT: 'rgba(255,51,102,0.06)',
  SWITCH: 'rgba(167,139,250,0.06)',
  RESET: 'rgba(0,255,136,0.06)',
  WARN: 'rgba(255,170,0,0.06)',
  ERROR: 'rgba(255,51,102,0.08)',
};

export function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>(MOCK_ACCOUNTS);
  const [snapshot, setSnapshot] = useState<SystemSnapshot>(MOCK_SNAPSHOT);
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);
  const [serverOnline, setServerOnline] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [lastPoll, setLastPoll] = useState<Date>(new Date());
  const [now, setNow] = useState<Date>(new Date());
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'low' | 'exhausted'>('all');
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async () => {
    setIsPolling(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/accounts`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data: SystemSnapshot = await res.json();
        setSnapshot(data);
        setAccounts(data.accounts);
        setServerOnline(true);
        setLogs((prev) => [
          { ts: Date.now(), type: 'SYNC', message: `Server sync → ${data.accounts.length} accounts updated` },
          ...prev.slice(0, 49),
        ]);
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    } finally {
      setIsPolling(false);
      setLastPoll(new Date());
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchData]);

  const filtered = accounts.filter(
    (a) => filterStatus === 'all' || a.status === filterStatus,
  );

  const stats = {
    total: accounts.length,
    available: accounts.filter((a) => a.status === 'available').length,
    low: accounts.filter((a) => a.status === 'low').length,
    exhausted: accounts.filter((a) => a.status === 'exhausted').length,
  };

  const activeAccount = accounts.find((a) => a.isActive);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#07070f',
        fontFamily: "'Inter', sans-serif",
        color: '#e2e4f0',
        backgroundImage:
          'linear-gradient(rgba(0,212,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.015) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    >
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,212,255,0.3); }
      `}</style>

      {/* ── HEADER ── */}
      <header
        style={{
          borderBottom: '1px solid rgba(0,212,255,0.08)',
          background: 'rgba(7,7,15,0.95)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
            {/* Left: Logo + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(0,212,255,0.1)',
                  border: '1px solid rgba(0,212,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(0,212,255,0.15)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#00d4ff" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#00d4ff" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '13px',
                    color: '#e2e4f0',
                    letterSpacing: '0.12em',
                    lineHeight: 1.2,
                  }}
                >
                  ANTIGRAVITY
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    color: '#3a3d52',
                    letterSpacing: '0.14em',
                    lineHeight: 1.2,
                  }}
                >
                  QUOTA TRACKER · v1.2.4
                </div>
              </div>
            </div>

            {/* Center: Active account */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {activeAccount && (
                <>
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#00d4ff',
                      boxShadow: '0 0 8px rgba(0,212,255,0.8)',
                      animation: 'pulse-dot 2s infinite',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      color: '#6b7299',
                      letterSpacing: '0.06em',
                    }}
                  >
                    ACTIVE
                  </span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      color: '#00d4ff',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {activeAccount.email}
                  </span>
                </>
              )}
            </div>

            {/* Right: Clock + status + refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {/* Server status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: serverOnline ? '#00ff88' : '#ff3366',
                    boxShadow: serverOnline
                      ? '0 0 6px rgba(0,255,136,0.8)'
                      : '0 0 6px rgba(255,51,102,0.8)',
                  }}
                />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    color: serverOnline ? '#00ff88' : '#ff3366',
                    letterSpacing: '0.1em',
                  }}
                >
                  {serverOnline ? 'LIVE' : 'DEMO'}
                </span>
              </div>

              {/* Clock */}
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12px',
                  color: '#4a5068',
                  letterSpacing: '0.08em',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '5px',
                  padding: '4px 10px',
                }}
              >
                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </div>

              {/* Refresh button */}
              <button
                onClick={fetchData}
                disabled={isPolling}
                style={{
                  background: 'rgba(0,212,255,0.06)',
                  border: '1px solid rgba(0,212,255,0.15)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  color: '#00d4ff',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  cursor: isPolling ? 'not-allowed' : 'pointer',
                  opacity: isPolling ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ animation: isPolling ? 'spin-slow 1s linear infinite' : 'none' }}
                >
                  <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                REFRESH
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── DEMO BANNER ── */}
      {!serverOnline && (
        <div
          style={{
            background: 'rgba(255,170,0,0.06)',
            borderBottom: '1px solid rgba(255,170,0,0.12)',
            padding: '8px 24px',
          }}
        >
          <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffaa00" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                color: '#ffaa00',
                letterSpacing: '0.06em',
              }}
            >
              DEMO MODE — Server unreachable at 127.0.0.1:9876. Run{' '}
              <code
                style={{
                  background: 'rgba(255,170,0,0.1)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  letterSpacing: 0,
                }}
              >
                node server/server.js
              </code>{' '}
              to display live extension data. Showing mock dataset.
            </span>
          </div>
        </div>
      )}

      <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>

        {/* ── STAT TILES ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            marginBottom: '28px',
          }}
        >
          {[
            { label: 'TOTAL ACCOUNTS', value: stats.total, color: '#4a5068', glow: 'none' },
            { label: 'AVAILABLE', value: stats.available, color: '#00ff88', glow: '0 0 20px rgba(0,255,136,0.15)' },
            { label: 'LOW QUOTA', value: stats.low, color: '#ffaa00', glow: '0 0 20px rgba(255,170,0,0.15)' },
            { label: 'EXHAUSTED', value: stats.exhausted, color: '#ff3366', glow: '0 0 20px rgba(255,51,102,0.15)' },
          ].map((tile) => (
            <div
              key={tile.label}
              style={{
                background: 'rgba(10,12,28,0.85)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(0,212,255,0.06)',
                borderRadius: '10px',
                padding: '20px',
                boxShadow: tile.glow,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  color: '#3a3d52',
                  letterSpacing: '0.12em',
                  marginBottom: '8px',
                }}
              >
                {tile.label}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '36px',
                  color: tile.color,
                  lineHeight: 1,
                  fontWeight: 300,
                }}
              >
                {String(tile.value).padStart(2, '0')}
              </div>
            </div>
          ))}
        </div>

        {/* ── FILTER TOOLBAR ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#3a3d52',
                letterSpacing: '0.12em',
                marginRight: '4px',
              }}
            >
              FILTER
            </span>
            {(['all', 'available', 'low', 'exhausted'] as const).map((s) => {
              const isActive = filterStatus === s;
              const colors: Record<string, string> = {
                all: '#4a5068',
                available: '#00ff88',
                low: '#ffaa00',
                exhausted: '#ff3366',
              };
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '10px',
                    letterSpacing: '0.08em',
                    padding: '4px 12px',
                    borderRadius: '5px',
                    border: `1px solid ${isActive ? colors[s] : 'rgba(255,255,255,0.05)'}`,
                    background: isActive ? `${colors[s]}18` : 'rgba(255,255,255,0.02)',
                    color: isActive ? colors[s] : '#3a3d52',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              color: '#3a3d52',
              letterSpacing: '0.08em',
            }}
          >
            LAST POLL {lastPoll.toLocaleTimeString('en-US', { hour12: false })} · AUTO-REFRESH 30s
          </span>
        </div>

        {/* ── ACCOUNT GRID ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {filtered.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
          {filtered.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '48px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                color: '#3a3d52',
                letterSpacing: '0.1em',
              }}
            >
              NO ACCOUNTS MATCH FILTER
            </div>
          )}
        </div>

        {/* ── ACTIVITY LOG ── */}
        <div
          style={{
            background: 'rgba(6,7,18,0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,212,255,0.06)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          {/* Log header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(0,212,255,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#00ff88',
                  boxShadow: '0 0 6px rgba(0,255,136,0.8)',
                  animation: 'blink 1s infinite',
                }}
              />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  color: '#4a5068',
                  letterSpacing: '0.12em',
                }}
              >
                ACTIVITY LOG
              </span>
            </div>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#3a3d52',
                letterSpacing: '0.08em',
              }}
            >
              {logs.length} EVENTS
            </span>
          </div>

          {/* Log entries */}
          <div
            style={{
              maxHeight: '280px',
              overflowY: 'auto',
            }}
          >
            {logs.map((entry, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '12px',
                  padding: '7px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                  background: i === 0 ? LOG_BG[entry.type] : 'transparent',
                  transition: 'background 0.3s',
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '10px',
                    color: '#2a2d3e',
                    flexShrink: 0,
                    letterSpacing: '0.02em',
                  }}
                >
                  {formatTimestamp(entry.ts)}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    color: LOG_COLORS[entry.type],
                    background: `${LOG_COLORS[entry.type]}15`,
                    border: `1px solid ${LOG_COLORS[entry.type]}30`,
                    borderRadius: '3px',
                    padding: '1px 5px',
                    letterSpacing: '0.1em',
                    flexShrink: 0,
                    minWidth: '46px',
                    textAlign: 'center',
                  }}
                >
                  {entry.type}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    color: '#4a5068',
                    letterSpacing: '0.02em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '32px 0 16px', display: 'flex', justifyContent: 'center', gap: '24px' }}>
          {[
            `SNAPSHOT ${formatLastUpdated(snapshot.lastUpdated)}`,
            `EXT ${snapshot.extensionVersion}`,
            `${stats.total} ACCOUNTS`,
            '127.0.0.1:9876',
          ].map((item) => (
            <span
              key={item}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#2a2d3e',
                letterSpacing: '0.1em',
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}
