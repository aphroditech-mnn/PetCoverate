// Lightweight session ownership for an accountless app.
//
// There are no logins, but we still don't want anyone to *act as* anyone else.
// On join the server mints a secret, stores only its sha-256 on the presence
// row, and hands the secret to the browser in an httpOnly, SameSite=Strict
// cookie. Every mutating call then proves ownership of its claimed id by
// presenting that cookie. The secret never leaves the cookie; the id stays a
// public handle. Nothing durable — the hash dies with the ephemeral row.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "pulse_session";
// Presence is reaped after 15s of silence anyway; this is just a ceiling.
const COOKIE_MAX_AGE = 60 * 60; // 1 hour

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Mint a secret for `id`. Returns the hash to persist and the Set-Cookie value.
export function createSession(id: string): {
  tokenHash: string;
  setCookie: string;
} {
  const token = randomBytes(32).toString("base64url");
  const cookie = [
    `${SESSION_COOKIE}=${id}.${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict", // state-changing requests are same-origin only → no CSRF
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ].join("; ");
  return { tokenHash: hashToken(token), setCookie: cookie };
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function readCookie(request: NextRequest, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function parseSession(
  request: NextRequest,
): { id: string; token: string } | null {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!id || !token) return null;
  return { id, token };
}

function tokenMatches(token: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Returns the authenticated session id, or null if the caller can't prove
// ownership of it. This is the authoritative identity — never trust an id from
// the request body/query over this.
export async function authenticate(
  request: NextRequest,
): Promise<string | null> {
  const parsed = parseSession(request);
  if (!parsed) return null;
  const row = await prisma.presence.findUnique({
    where: { id: parsed.id },
    select: { tokenHash: true },
  });
  if (!row || !tokenMatches(parsed.token, row.tokenHash)) return null;
  return parsed.id;
}
