import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SignalType } from "@/lib/types";
import { isValidId, isValidSignalPayload } from "@/lib/validate";
import { authenticate } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

// Cap how many pending messages one recipient can hold, so nobody can flood a
// victim's mailbox. A real session holds only a handful at a time.
const MAILBOX_CAP = 128;

// POST /api/signal — body { fromId, toId, type, payload? }
// Drops one message into the recipient's mailbox and manages the `busy` flag.
// The sender must prove (via session cookie) that it actually owns fromId, so
// nobody can impersonate, hijack a negotiation, or poison another user's state.
export async function POST(request: NextRequest) {
  if (!rateLimit(`signal:${clientIp(request)}`, 300, 60_000)) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }

  const me = await authenticate(request);
  if (!me) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { fromId, toId, type, payload } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isValidId(fromId) || !isValidId(toId)) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }
  // You may only send as yourself.
  if (fromId !== me) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (toId === me) {
    return Response.json({ error: "cannot signal self" }, { status: 400 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }

  const signalType = type as SignalType;
  if (!isValidSignalPayload(signalType, payload)) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const payloadStr = typeof payload === "string" ? payload : null;

  const target = await prisma.presence.findUnique({
    where: { id: toId },
    select: { busy: true },
  });

  // Free both peers on hang-up FIRST — before any "peer is gone" short-circuit —
  // so ending a call always frees the sender even if the other side vanished
  // without a clean leave (e.g. a network drop → RTCPeerConnection "failed").
  if (signalType === "decline" || signalType === "end") {
    await prisma.presence.updateMany({
      where: { id: { in: [fromId, toId] } },
      data: { busy: false },
    });
  }

  if (signalType === "request") {
    // Enforce "one active connection at a time": if the target is gone or busy,
    // auto-decline instead of delivering.
    if (!target || target.busy) {
      await sendDecline(toId, fromId);
      return Response.json({ ok: true, autoDeclined: true });
    }
  } else if (!target) {
    // Peer vanished — nothing to deliver (sender already freed above if needed).
    return Response.json({ ok: true, delivered: false });
  }

  // accept: the connection is now active → mark BOTH peers busy.
  if (signalType === "accept") {
    await prisma.presence.updateMany({
      where: { id: { in: [fromId, toId] } },
      data: { busy: true },
    });
  }

  // Anti-flood: refuse to pile onto a full mailbox.
  const pending = await prisma.signal.count({ where: { toId } });
  if (pending >= MAILBOX_CAP) {
    return Response.json({ error: "recipient mailbox full" }, { status: 429 });
  }

  await prisma.signal.create({
    data: { fromId, toId, type: signalType, payload: payloadStr },
  });

  return Response.json({ ok: true });
}

// Helper: deliver an auto-decline from `target` back to `initiator`.
async function sendDecline(targetId: string, initiatorId: string) {
  await prisma.signal.create({
    data: {
      fromId: targetId,
      toId: initiatorId,
      type: "decline",
      payload: null,
    },
  });
}
