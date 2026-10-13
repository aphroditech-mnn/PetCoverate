import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import type { PollResponse } from "@/lib/types";
import { authenticate } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A single poll must never ship the entire planet's dots in one response.
const MAX_PEERS = 2000;

// GET /api/poll — the single endpoint that drives the live map. Identity comes
// from the session cookie (not a query param), so a caller can only heartbeat
// and drain their OWN mailbox. It (1) heartbeats the caller, (2) reaps stale
// presence + orphan signals, (3) returns the online peers, (4) drains this
// user's mailbox.
export async function GET(request: NextRequest) {
  if (!rateLimit(`poll:${clientIp(request)}`, 150, 60_000)) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }

  const id = await authenticate(request);
  if (!id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat — refresh lastSeen for the caller only.
  await prisma.presence.updateMany({
    where: { id },
    data: { lastSeen: new Date(now) },
  });

  // 2) Reap stale presence rows and orphaned signals.
  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  // 3) Online peers, excluding self (capped).
  const peers = await prisma.presence.findMany({
    where: {
      id: { not: id },
      lastSeen: { gte: staleCutoff },
    },
    select: { id: true, lat: true, lng: true, busy: true },
    take: MAX_PEERS,
  });

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.busy,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return Response.json(response);
}
