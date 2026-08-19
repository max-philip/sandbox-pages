// src/pages/Wheel.tsx
import { useEffect, useRef, useState } from 'react';
import styles from './Wheel.module.scss';
import {
  RADIUS,
  labelFontSize,
  labelMaxChars,
  labelTransform,
  parseEntries,
  randomIndex,
  segmentFill,
  segmentPath,
  spinTo,
  type Entry,
} from '../lib/wheel';

const STORAGE_KEY = 'sandbox.wheel.entries';
const SPIN_MS = 4600;

function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Entry).id === 'string' &&
        typeof (e as Entry).label === 'string',
    );
  } catch {
    return [];
  }
}

function truncate(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export default function Wheel() {
  const [entries, setEntries] = useState<Entry[]>(loadEntries);
  const [draft, setDraft] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Entry | null>(null);
  const targetIndex = useRef(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const add = () => {
    const next = parseEntries(draft);
    if (next.length === 0) return;
    setEntries((prev) => [...prev, ...next]);
    setDraft('');
    setWinner(null);
  };

  const remove = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setWinner((w) => (w?.id === id ? null : w));
  };

  const settle = () => {
    setSpinning(false);
    setWinner(entries[targetIndex.current] ?? null);
  };

  const spin = () => {
    if (spinning || entries.length < 2) return;
    const index = randomIndex(entries.length);
    targetIndex.current = index;
    setWinner(null);
    setSpinning(true);
    setRotation((r) => spinTo(r, index, entries.length));
    if (reducedMotion()) {
      // No transition fires, so settle on the next frame instead.
      requestAnimationFrame(() => settle());
    }
  };

  const count = entries.length;
  const fontSize = labelFontSize(Math.max(count, 1));
  const maxChars = labelMaxChars(fontSize);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>wheel</h1>
        <p className={styles.sub}>Add options, spin, let it decide.</p>
      </header>

      <div className={styles.layout}>
        <section className={styles.stage}>
          <div className={styles.wheelWrap}>
            <svg className={styles.pointer} viewBox="0 0 24 20" width="24" height="20" aria-hidden="true">
              <path
                d="M12 20 L2 0 L22 0 Z"
                fill="var(--accent)"
                stroke="var(--bg)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            <svg
              className={styles.disc}
              viewBox={`${-RADIUS - 4} ${-RADIUS - 4} ${(RADIUS + 4) * 2} ${(RADIUS + 4) * 2}`}
              style={{
                transform: `rotate(${rotation}deg)`,
                transition:
                  spinning && !reducedMotion()
                    ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 0.84, 0.28, 1)`
                    : 'none',
              }}
              onTransitionEnd={settle}
              role="img"
              aria-label={count === 0 ? 'Empty wheel' : `Wheel with ${count} options`}
            >
              <circle r={RADIUS + 3} fill="var(--surface)" />

              {count === 0 && <circle r={RADIUS} fill="var(--surface)" stroke="var(--dim)" strokeWidth="1" />}

              {count === 1 && (
                <>
                  <circle r={RADIUS} fill={segmentFill(0, 1)} />
                  <text
                    y={-RADIUS * 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fontFamily="var(--font-sans)"
                    fill="#12121a"
                  >
                    {truncate(entries[0].label, 16)}
                  </text>
                </>
              )}

              {count > 1 &&
                entries.map((entry, i) => {
                  const { transform, anchor, x } = labelTransform(i, count, rotation);
                  return (
                    <g key={entry.id}>
                      <path
                        d={segmentPath(i, count)}
                        fill={segmentFill(i, count)}
                        stroke="var(--bg)"
                        strokeWidth="0.6"
                      />
                      <g transform={transform}>
                        <text
                          x={x}
                          y="0"
                          textAnchor={anchor}
                          dominantBaseline="middle"
                          fontSize={fontSize}
                          fontFamily="var(--font-sans)"
                          fill="#12121a"
                        >
                          {truncate(entry.label, maxChars)}
                        </text>
                      </g>
                    </g>
                  );
                })}

              <circle r="8" fill="var(--bg)" stroke="var(--dim)" strokeWidth="1" />
            </svg>
          </div>

          <button className={styles.spin} onClick={spin} disabled={spinning || count < 2}>
            {spinning ? 'spinning…' : 'spin'}
          </button>

          <div className={styles.result} aria-live="polite">
            {count < 2 && !spinning && <span className={styles.hint}>Add at least two options to spin.</span>}
            {winner && (
              <>
                <span className={styles.winnerLabel}>{winner.label}</span>
                <button className={styles.ghost} onClick={() => remove(winner.id)}>
                  remove and respin
                </button>
              </>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <label className={styles.fieldLabel} htmlFor="wheel-draft">
            Options
          </label>
          <textarea
            id="wheel-draft"
            className={styles.input}
            rows={3}
            value={draft}
            placeholder={'One per line\nor comma separated'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
          />
          <div className={styles.panelActions}>
            <button className={styles.add} onClick={add} disabled={draft.trim() === ''}>
              add
            </button>
            <button className={styles.ghost} onClick={() => setEntries([])} disabled={count === 0}>
              clear
            </button>
          </div>

          <ol className={styles.list}>
            {entries.map((entry, i) => (
              <li key={entry.id} className={styles.listItem}>
                <span className={styles.swatch} style={{ background: segmentFill(i, count) }} aria-hidden="true" />
                <span className={styles.listLabel}>{entry.label}</span>
                <button
                  className={styles.remove}
                  onClick={() => remove(entry.id)}
                  aria-label={`Remove ${entry.label}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}