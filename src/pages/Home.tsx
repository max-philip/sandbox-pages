import { useEffect, useState } from "react";
import styles from "./Home.module.scss";
import { randomQuote } from "../lib/quotes";

const QUOTES = [
  "Don't smile because it's over, cry because it happened.",
  "I merge code like I merge lanes.",
  "A man with no pants fears no pickpockets.",
  "A bottle of Heineken, shaken, not stirred.",
  "Bird flu? Yeah, they tend to do that.",
  "Yeah our platform is fully configurable. You configureout a way to develop your own solution.",
  "We never had this problem until you started monitoring for it.",
  "You pass 100% of the tests you don't write."
];

interface Whoami {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  colo: string | null;
  isp: string | null;
  timezone: string | null;
}

function guessOS(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/linux/i.test(ua)) return "Linux";
  return "unknown";
}

function guessBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "unknown";
}

function joinLocation(w: Whoami | null): string {
  if (!w) return "…";
  const parts = [w.city, w.region, w.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "unknown";
}

export default function Home() {
  const [quote] = useState(() => randomQuote(QUOTES));
  const [os] = useState(() => guessOS(navigator.userAgent));
  const [browser] = useState(() => guessBrowser(navigator.userAgent));
  const [locale] = useState(() => navigator.language);
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [display] = useState(() => `${window.screen.width}×${window.screen.height}`);
  const [viewport, setViewport] = useState(() => `${window.innerWidth}×${window.innerHeight}`);
  const [whoami, setWhoami] = useState<Whoami | null>(null);

  useEffect(() => {
    const onResize = () => setViewport(`${window.innerWidth}×${window.innerHeight}`);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/whoami", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: Whoami) => setWhoami(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const rows: [string, string][] = [
    ["os", os],
    ["browser", browser],
    ["display", display],
    ["viewport", viewport],
    ["language", locale],
    ["timezone", timeZone],
    ["ip", whoami?.ip ?? "…"],
    ["location", joinLocation(whoami)],
    ["isp", whoami?.isp ?? "…"],
    ["edge", whoami?.colo ?? "…"],
  ];

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.panelTitle}>whoami</span>
        </div>
        <dl className={styles.stats}>
          {rows.map(([label, value]) => (
            <div className={styles.row} key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className={styles.quote}>{quote}</p>
    </div>
  );
}
