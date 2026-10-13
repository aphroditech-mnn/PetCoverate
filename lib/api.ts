// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";

export async function join(
  id: string,
  lat: number,
  lng: number,
  vibe?: string | null,
): Promise<void> {
  await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat, lng, vibe: vibe ?? null }),
  });
}

// Identity comes from the session cookie, so we don't put the id in the URL
// (keeps it out of history/proxy logs). A 401 means our session lapsed (e.g. the
// tab slept past the stale window) — surface it so the caller can re-join.
export class SessionExpiredError extends Error {
  constructor() {
    super("session expired");
    this.name = "SessionExpiredError";
  }
}

export async function poll(): Promise<PollResponse> {
  const res = await fetch("/api/poll", { cache: "no-store" });
  if (res.status === 401) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromId, toId, type, payload }),
  });
}

// Fire-and-forget leave that survives the tab closing. When the user is mid-
// connection we pass the peer id so the server can free the peer and tell them
// the stranger is gone (otherwise the peer sits "busy" until it goes stale).
export function leave(id: string, peerId?: string): void {
  const body = JSON.stringify(peerId ? { id, peerId } : { id });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}
