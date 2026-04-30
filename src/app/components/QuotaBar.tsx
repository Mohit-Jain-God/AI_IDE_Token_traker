import type { ModelQuota } from './types';

interface QuotaBarProps {
  model: ModelQuota;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function QuotaBar({ model }: QuotaBarProps) {
  const remaining = model.limit - model.used;
  const pct = Math.max(0, Math.min(100, (remaining / model.limit) * 100));

  const color =
    pct <= 0
      ? '#3d1a2a'
      : pct < 15
      ? '#ffaa00'
      : pct < 40
      ? '#f0c040'
      : '#00ff88';

  const trackColor =
    pct <= 0 ? 'rgba(255,51,102,0.1)' : 'rgba(255,255,255,0.04)';

  const glowColor =
    pct <= 0
      ? 'none'
      : pct < 15
      ? '0 0 6px rgba(255,170,0,0.4)'
      : '0 0 6px rgba(0,255,136,0.3)';

  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: '#6b7299',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {model.modelName}
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: pct <= 0 ? '#ff3366' : pct < 15 ? '#ffaa00' : '#e2e4f0',
            letterSpacing: '0.02em',
          }}
        >
          {formatTokens(remaining)}{' '}
          <span style={{ color: '#3a3d52' }}>/ {formatTokens(model.limit)}</span>
        </span>
      </div>
      <div
        style={{
          height: '3px',
          borderRadius: '2px',
          background: trackColor,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: '2px',
            boxShadow: glowColor,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}
