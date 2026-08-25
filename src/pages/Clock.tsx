import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useExactTime } from "../lib/useExactTime";
import styles from "./Clock.module.scss";

/** Random light color so the clock text isn't the same on every load — always readable on the dark background. */
function randomLightColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 45 + Math.floor(Math.random() * 30);
  const l = 75 + Math.floor(Math.random() * 15);
  return `hsl(${h} ${s}% ${l}%)`;
}

const SETTINGS_KEY = "sandbox.clock.settings";

interface ClockSettings {
  showSeconds: boolean;
  showMs: boolean;
  use12Hour: boolean;
}

const DEFAULT_SETTINGS: ClockSettings = {
  showSeconds: true,
  showMs: true,
  use12Hour: false,
};

function loadSettings(): ClockSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ClockSettings>;
    return {
      showSeconds: parsed.showSeconds ?? true,
      showMs: parsed.showMs ?? true,
      use12Hour: parsed.use12Hour ?? false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Timezone offset as "+10:00". Date.getTimezoneOffset() is minutes *behind* UTC, so the sign flips. */
function utcOffset(d: Date): string {
  const mins = -d.getTimezoneOffset();
  const sign = mins < 0 ? "-" : "+";
  const abs = Math.abs(mins);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

export default function Clock() {
  const { now, status, uncertainty } = useExactTime();
  const d = new Date(now);
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  const [clockColor] = useState(randomLightColor);
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const { showSeconds, showMs, use12Hour } = settings;

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!settingsOpen) return;

    const closeAndReturnFocus = () => {
      setSettingsOpen(false);
      settingsButtonRef.current?.focus();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAndReturnFocus();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      closeAndReturnFocus();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [settingsOpen]);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: use12Hour ? "numeric" : "2-digit",
        minute: "2-digit",
        second: showSeconds ? "2-digit" : undefined,
        hourCycle: use12Hour ? "h12" : "h23",
      }),
    [showSeconds, use12Hour],
  );

  const toggle = (key: keyof ClockSettings) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div
      className={styles.page}
      style={{ "--clock-fg": clockColor } as CSSProperties}
    >
      <button
        ref={settingsButtonRef}
        type="button"
        className={styles.settingsButton}
        aria-label="Clock settings"
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33
               1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82
               1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          />
        </svg>
      </button>

      <time
        className={styles.date}
        data-status={status}
        dateTime={d.toISOString()}
      >
        {dateFmt.format(d)}
      </time>

      <time
        className={styles.time}
        data-status={status}
        data-ampm={use12Hour}
        dateTime={d.toISOString()}
      >
        {fmt.formatToParts(d).map((part, i) => {
          if (part.type === "dayPeriod") {
            return (
              <span key={i} className={styles.ampm}>
                {part.value}
              </span>
            );
          }
          if (part.type === "second" && showMs) {
            return (
              <span key={i}>
                {part.value}
                <span className={styles.ms}>.{ms}</span>
              </span>
            );
          }
          return part.value;
        })}
      </time>

      <dl className={styles.meta} data-status={status}>
        <div className={styles.row}>
          <dt className={styles.key}>zone</dt>
          <dd className={styles.val}>{zone}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>utc</dt>
          <dd className={styles.val}>{utcOffset(d)}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>accuracy</dt>
          <dd className={styles.val}>
            {status === "syncing" && "syncing…"}
            {status === "ready" &&
              uncertainty !== null &&
              `±${Math.round(uncertainty)} ms`}
            {status === "error" && "unsynced"}
          </dd>
        </div>
      </dl>

      {settingsOpen && (
        <div
          ref={popoverRef}
          className={styles.popover}
          role="dialog"
          aria-labelledby="clock-settings-title"
        >
          <span id="clock-settings-title" className={styles.popoverTitle}>
            settings
          </span>

          <div className={styles.settings}>
            <label className={styles.switchRow}>
              <span className={styles.switchText}>seconds</span>
              <button
                type="button"
                role="switch"
                aria-checked={showSeconds}
                className={styles.switch}
                onClick={() => toggle("showSeconds")}
              >
                <span className={styles.switchThumb} />
              </button>
            </label>

            <label className={styles.switchRow} data-disabled={!showSeconds}>
              <span className={styles.switchText}>milliseconds</span>
              <button
                type="button"
                role="switch"
                aria-checked={showMs}
                disabled={!showSeconds}
                className={styles.switch}
                onClick={() => toggle("showMs")}
              >
                <span className={styles.switchThumb} />
              </button>
            </label>

            <label className={styles.switchRow}>
              <span className={styles.switchText}>AM/PM</span>
              <button
                type="button"
                role="switch"
                aria-checked={use12Hour}
                className={styles.switch}
                onClick={() => toggle("use12Hour")}
              >
                <span className={styles.switchThumb} />
              </button>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}