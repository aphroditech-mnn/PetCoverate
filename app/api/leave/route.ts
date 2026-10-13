import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidId } from "@/lib/validate";
import { authenticate, clearSessionCookie } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { peerId? }. Identity comes from the session cookie,
// so you can only ever remove yourself. Removes the presence row and any
// pending signals to/from this user. If the leaver was in an active connection,
// we also free that peer and drop an "end" into their mailbox so their UI tears
// down immediately instead of waiting for the stale timeout. Called via
// navigator.sendBeacon on tab close, so the body may arrive as text — parse
// defensively, and never error (just clear the cookie).
export async function POST(request: NextRequest) {
  if (!rateLimit(`leave:${clientIp(request)}`, 30, 60_000)) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }

  const me = await authenticate(request);
  if (!me) {
    // No valid session to act on — just make sure any cookie is cleared.
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": clearSessionCookie() } },
    );
  }

  let peerId: unknown;
  try {
    const text = await request.text();
    const parsed = text ? JSON.parse(text) : {};
    peerId = parsed?.peerId;
  } catch {
    peerId = undefined;
  }

  // Were we actually in a connection? Only then is it legitimate to free a peer.
  const leaver = await prisma.presence.findUnique({
    where: { id: me },
    select: { busy: true },
  });

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: me }, { fromId: me }] },
  });
  await prisma.presence.deleteMany({ where: { id: me } });

  // Notify + free the connected peer, if any. Gated on us having been busy and
  // the peer still being busy, so a stray peerId can't un-busy an idle user.
  // (Created after the delete above so this "end" isn't swept away.)
  if (isValidId(peerId) && leaver?.busy) {
    await prisma.presence.updateMany({
      where: { id: peerId, busy: true },
      data: { busy: false },
    });
    await prisma.signal.create({
      data: { fromId: me, toId: peerId, type: "end", payload: null },
    });
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie() } },
  );
}
