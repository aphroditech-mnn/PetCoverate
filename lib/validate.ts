// Shared request validation, applied consistently across every endpoint (the
// original validated ids on /join but not on /poll, /signal, or /leave).

import type { SignalType } from "@/lib/types";

export const ID_MIN = 8;
export const ID_MAX = 64;

export function isValidId(v: unknown): v is string {
  return typeof v === "string" && v.length >= ID_MIN && v.length <= ID_MAX;
}

export const MAX_PAYLOAD = 64 * 1024; // SDP/ICE are small; cap to be safe.

// offer/answer carry an SDP description, ice carries a candidate init, and the
// handshake types carry nothing. Validating the shape here means malformed
// JSON can't be stored and later blow up a peer's JSON.parse during signaling.
export function isValidSignalPayload(
  type: SignalType,
  payload: unknown,
): boolean {
  const needsPayload = type === "offer" || type === "answer" || type === "ice";
  if (!needsPayload) {
    // request / accept / decline / end must not smuggle a payload.
    return payload === null || payload === undefined;
  }
  if (typeof payload !== "string" || payload.length === 0 || payload.length > MAX_PAYLOAD) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object") return false;
  if (type === "ice") return true; // RTCIceCandidateInit shape varies; object is enough
  const d = parsed as { type?: unknown; sdp?: unknown };
  return typeof d.type === "string" && typeof d.sdp === "string";
}
