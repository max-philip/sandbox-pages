// src/lib/quotes.ts

/** Picks a random entry from a list of quotes. */
export function randomQuote<T>(quotes: readonly T[]): T {
  return quotes[Math.floor(Math.random() * quotes.length)];
}
