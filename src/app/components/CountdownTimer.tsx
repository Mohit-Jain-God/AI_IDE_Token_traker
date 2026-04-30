import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  targetIso: string | null;
  className?: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDiff(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function CountdownTimer({ targetIso, className = '' }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();

    function tick() {
      setRemaining(target - Date.now());
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!targetIso) return null;

  const isExpired = remaining <= 0;

  return (
    <span className={className} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {isExpired ? (
        <span style={{ color: '#00ff88' }}>READY</span>
      ) : (
        <span style={{ color: '#ff3366' }}>{formatDiff(remaining)}</span>
      )}
    </span>
  );
}
