// A live number that says when it changes. When a refresh brings a different value while the number
// is on screen, its cell lights up for a moment with ▲ or ▼, so a moving board can be read at a
// glance. Never on first paint, never when the shown text stays the same, and the arrow says it
// without colour (under reduced motion the tint does not fade, it simply goes after the same time).
import { useEffect, useRef, useState } from 'react';

const FLASH_MS = 1200;
export function Tick({ value, format, className = '', title }: { value: number | null | undefined; format: (v: number) => string; className?: string; title?: string }) {
  const text = value == null || !Number.isFinite(value) ? '—' : format(value);
  const last = useRef<{ text: string; value: number | null | undefined } | null>(null);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const [n, setN] = useState(0); // restarts the animation when two changes come close together
  // The timer that ends a flash lives across renders: a later refresh that changes nothing on screen
  // must not cancel it (the flash would then stay lit), and only a new flash replaces it.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const before = last.current;
    last.current = { text, value };
    if (!before || before.text === text || before.value == null || value == null || !Number.isFinite(value) || before.value === value) return;
    setDir(value > before.value ? 'up' : 'down'); setN((x) => x + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDir(null), FLASH_MS);
  }, [text, value]);
  return (
    <span key={n} className={`tick num ${dir ? `flash ${dir}` : ''} ${className}`} title={title}>
      {text}
      {dir && <span className="tickArrow" aria-hidden>{dir === 'up' ? '▲' : '▼'}</span>}
      {dir && <span className="srOnly">{dir === 'up' ? ' (up)' : ' (down)'}</span>}
    </span>
  );
}
