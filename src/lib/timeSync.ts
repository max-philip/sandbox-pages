export type Sync = {
  /** ms to add to clientNow() to get true UTC */
  offset: number;
  /** ± on that offset, derived from the round trip */
  uncertainty: number;
  /** clientNow() when this sync was taken — detects staleness */
  at: number;
  /** Date.now() - clientNow() at sync time — detects clock steps */
  skewAtSync: number;
};

type Sample = { offset: number; rtt: number };

/**
 * Wall-clock time in Unix ms, built from the monotonic clock.
 * timeOrigin is fixed at document creation and performance.now() only counts
 * up, so a mid-session NTP correction can't move this. It can drift from real
 * time if the machine suspends — that's what skew() is for.
 */
export function clientNow(): number {
  return performance.timeOrigin + performance.now();
}

/** Diverges from its sync-time value when the OS steps the clock or the machine sleeps. */
export function skew(): number {
  return Date.now() - clientNow();
}

export function trueNow(s: Sync): number {
  return clientNow() + s.offset;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("aborted", "AbortError"));
    };
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function takeSample(signal: AbortSignal): Promise<Sample> {
  const t0 = clientNow();
  const res = await fetch(`/api/time?t=${t0}`, { cache: "no-store", signal });
  const t3 = clientNow();

  if (!res.ok) throw new Error(`/api/time returned ${res.status}`);
  const body = (await res.json()) as { t?: unknown };
  if (typeof body.t !== "number") throw new Error("bad payload");

  const rtt = t3 - t0;
  // Cristian's algorithm: assume both legs took equally long, so the server's
  // timestamp lines up with the midpoint of the interval we measured.
  return { offset: body.t - (t0 + rtt / 2), rtt };
}

export async function sync(signal: AbortSignal, count = 5): Promise<Sync> {
  const samples: Sample[] = [];

  for (let i = 0; i < count; i++) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    try {
      samples.push(await takeSample(signal));
    } catch (err) {
      if (signal.aborted) throw err;
      // one bad sample is survivable
    }
    if (i < count - 1) await sleep(120, signal);
  }

  if (samples.length === 0) throw new Error("time sync failed: no samples");

  // Lowest RTT means least asymmetric queuing delay, so smallest error.
  // NTP does the same. Averaging would pull the good sample toward the bad ones.
  console.log("rtts", samples.map((s) => Math.round(s.rtt)));
  samples.sort((a, b) => a.rtt - b.rtt);
  const best = samples[0];

  return {
    offset: best.offset,
    uncertainty: best.rtt / 2,
    at: clientNow(),
    skewAtSync: skew(),
  };
}
