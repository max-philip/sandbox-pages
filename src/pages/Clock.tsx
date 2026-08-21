import { useState, type CSSProperties } from "react";
import { useExactTime } from "../lib/useExactTime";
import styles from "./Clock.module.scss";

/** Random light color so the clock text isn't the same on every load — always readable on the dark background. */
function randomLightColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 45 + Math.floor(Math.random() * 30);
  const l = 75 + Math.floor(Math.random() * 15);
  return `hsl(${h} ${s}% ${l}%)`;
}

const fmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const zone = fmt.resolvedOptions().timeZone;

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

  return (
    <div
      className={styles.page}
      style={{ "--clock-fg": clockColor } as CSSProperties}
    >
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
        dateTime={d.toISOString()}
      >
        {fmt.format(d)}
        <span className={styles.ms}>.{ms}</span>
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
    </div>
  );
}