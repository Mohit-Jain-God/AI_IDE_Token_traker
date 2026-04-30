import type { Account } from './types';
import { QuotaBar } from './QuotaBar';
import { CountdownTimer } from './CountdownTimer';

interface AccountCardProps {
  account: Account;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  if (diff < 60_000) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const SOURCE_LABELS: Record<string, string> = {
  'local-server': 'LOCAL',
  grpc: 'gRPC',
  cache: 'CACHE',
  log: 'LOG',
  manual: 'MANUAL',
};

export function AccountCard({ account }: AccountCardProps) {
  const { status, isActive, email, id, models, lastSnapshot, source } = account;

  // First model's resetAt used for the countdown (typically all models share the same reset window)
  const resetAt = models.find((m) => m.resetAt)?.resetAt ?? null;

  const borderColor = isActive
    ? 'rgba(0, 212, 255, 0.35)'
    : status === 'exhausted'
    ? 'rgba(255, 51, 102, 0.18)'
    : status === 'low'
    ? 'rgba(255, 170, 0, 0.18)'
    : 'rgba(0, 212, 255, 0.06)';

  const cardGlow = isActive
    ? '0 0 0 1px rgba(0,212,255,0.25), 0 4px 40px rgba(0,212,255,0.08)'
    : status === 'exhausted'
    ? '0 4px 24px rgba(255,51,102,0.06)'
    : '0 4px 24px rgba(0,0,0,0.3)';

  const bgOverlay = isActive
    ? 'rgba(0, 212, 255, 0.025)'
    : status === 'exhausted'
    ? 'rgba(255, 51, 102, 0.02)'
    : 'transparent';

  const statusDotColor =
    status === 'available' ? '#00ff88' : status === 'low' ? '#ffaa00' : '#ff3366';

  const statusLabel =
    status === 'available'
      ? 'AVAILABLE'
      : status === 'low'
      ? 'LOW QUOTA'
      : 'EXHAUSTED';

  const statusGlow =
    status === 'available'
      ? '0 0 8px rgba(0,255,136,0.8)'
      : status === 'low'
      ? '0 0 8px rgba(255,170,0,0.8)'
      : '0 0 8px rgba(255,51,102,0.8)';

  return (
    <div
      style={{
        background: `linear-gradient(135deg, rgba(10,12,28,0.9) 0%, rgba(8,10,22,0.95) 100%)`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        boxShadow: cardGlow,
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      {/* Background tint overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: bgOverlay,
          pointerEvents: 'none',
        }}
      />

      {/* Active account top accent bar */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent 0%, #00d4ff 50%, transparent 100%)',
            boxShadow: '0 0 12px rgba(0,212,255,0.6)',
          }}
        />
      )}

      {/* Card Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#3a3d52',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '4px',
              padding: '2px 5px',
              flexShrink: 0,
            }}
          >
            {id}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: isActive ? '#00d4ff' : '#8b8fa8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
            title={email}
          >
            {email}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
          {isActive && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#00d4ff',
                background: 'rgba(0,212,255,0.1)',
                border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: '3px',
                padding: '2px 5px',
                letterSpacing: '0.08em',
              }}
            >
              ACTIVE
            </span>
          )}
          {source && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#3a3d52',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '3px',
                padding: '2px 5px',
                letterSpacing: '0.06em',
              }}
            >
              {SOURCE_LABELS[source] ?? source.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: statusDotColor,
            boxShadow: statusGlow,
            flexShrink: 0,
            animation: status === 'available' ? 'none' : 'pulse-dot 2s infinite',
          }}
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: statusDotColor,
            letterSpacing: '0.1em',
          }}
        >
          {statusLabel}
        </span>
        {status === 'exhausted' && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#3a3d52',
              letterSpacing: '0.05em',
            }}
          >
            · COOLDOWN
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', marginBottom: '14px' }} />

      {/* Model Quota Bars */}
      <div>
        {models.map((m) => (
          <QuotaBar key={m.modelId} model={m} />
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: '14px', marginBottom: '12px' }} />

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#3a3d52',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          SYNC {timeAgo(lastSnapshot)}
        </span>
        {status === 'exhausted' && resetAt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#3a3d52',
                letterSpacing: '0.06em',
              }}
            >
              RESET IN
            </span>
            <CountdownTimer
              targetIso={resetAt}
              className=""
            />
          </div>
        )}
      </div>
    </div>
  );
}
