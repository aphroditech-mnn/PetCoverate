// Best-effort in-memory sliding-window rate limiter.
//
// IMPORTANT: this is per-process. On Vercel's serverless runtime each warm
// instance keeps its own window and a cold start resets it, so it is NOT a hard
// global limit — it's a cheap first line of defense that blunts naive floods
// hitting a single warm instance. For a real deployment, back this with a
// shared store (Upstash Redis / Vercel KV) keyed the same way.

import type { NextRequest } from "next/server";

const store = new Map<string, number[]>();
let lastSweep = 0;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Occasionally drop fully-expired keys so the map can't grow without bound.
  if (now - lastSweep > 60_000) {
    for (const [k, hits] of store) {
      if (hits.length === 0 || hits[hits.length - 1] < cutoff) store.delete(k);
    }
    lastSweep = now;
  }

  const hits = (store.get(key) ?? []).filter((t) => t >= cutoff);
  if (hits.length >= limit) {
    store.set(key, hits);
    return false; // over the limit
  }
  hits.push(now);
  store.set(key, hits);
  return true; // allowed
}

// Best-effort client IP. Behind Vercel/other proxies the real client is the
// first entry of x-forwarded-for.
export function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}
