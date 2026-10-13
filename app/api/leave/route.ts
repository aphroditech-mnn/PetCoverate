import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, peerId? }. Removes the presence row and any
// pending signals to/from this user. If peerId is given (the user was in an
// active connection) we also free that peer and drop an "end" into their mailbox
// so their UI tears down immediately instead of waiting for the stale timeout.
// Called via navigator.sendBeacon on tab close, so the body may arrive as text —
// parse defensively.
export async function POST(request: NextRequest) {
  let id: string | undefined;
  let peerId: string | undefined;
  try {
    const text = await request.text();
    const parsed = text ? JSON.parse(text) : {};
    id = parsed?.id as string | undefined;
    peerId = parsed?.peerId as string | undefined;
  } catch {
    id = undefined;
  }

  if (typeof id !== "string" || !id) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  // Notify + free the connected peer, if any. (Created after the delete above
  // so this "end" isn't swept away with the leaver's other signals.)
  if (typeof peerId === "string" && peerId) {
    await prisma.presence.updateMany({
      where: { id: peerId },
      data: { busy: false },
    });
    await prisma.signal.create({
      data: { fromId: id, toId: peerId, type: "end", payload: null },
    });
  }

  return Response.json({ ok: true });
}
