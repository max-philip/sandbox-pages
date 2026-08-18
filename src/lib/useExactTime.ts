import { useEffect, useRef, useState } from "react";
import { sync, trueNow, skew, clientNow, type Sync } from "./timeSync";

const STALE_MS = 5 * 60 * 1000;
const STEP_TOLERANCE_MS = 250;
const RETRY_MS = 15_000;

export type Status = "syncing" | "ready" | "error";

export function useExactTime() {
  const syncRef = useRef<Sync | null>(null);
  const inFlight = useRef(false);
  const nextTry = useRef(0);

  const [status, setStatus] = useState<Status>("syncing");
  const [uncertainty, setUncertainty] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ac = new AbortController();

    const run = async () => {
      if (inFlight.current || clientNow() < nextTry.current) return;
      inFlight.current = true;
      try {
        const s = await sync(ac.signal);
        syncRef.current = s;
        nextTry.current = 0;
        setUncertainty(s.uncertainty);
        setStatus("ready");
      } catch {
        // An abort is deliberate cancellation, not a failure. Backing off here
        // would punish the next attempt for our own teardown.
        if (ac.signal.aborted) return;
        nextTry.current = clientNow() + RETRY_MS;
        if (!syncRef.current) setStatus("error");
      } finally {
        inFlight.current = false;
      }
    };

    void run();

    // One trigger for everything: first sync, retry after failure, scheduled
    // resync, OS clock step, and suspend/resume.
    const watchdog = window.setInterval(() => {
      const s = syncRef.current;
      if (!s) {
        void run();
        return;
      }
      const stale = clientNow() - s.at > STALE_MS;
      const stepped = Math.abs(skew() - s.skewAtSync) > STEP_TOLERANCE_MS;
      if (stale || stepped) void run();
    }, 1000);

    return () => {
      ac.abort();
      clearInterval(watchdog);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const s = syncRef.current;
      setNow(s ? trueNow(s) : Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { now, status, uncertainty };
}
