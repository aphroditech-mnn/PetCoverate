import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { isValidId } from "@/lib/validate";
import { createSession } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { id, lat, lng } (raw coords).
// Applies a 1–3 km privacy offset, upserts the presence row, and mints a
// session secret (httpOnly cookie) so later calls can prove they own this id.
// Raw coordinates are never stored.
export async function POST(request: NextRequest) {
  if (!rateLimit(`join:${clientIp(request)}`, 12, 60_000)) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, lat, lng } = (body ?? {}) as Record<string, unknown>;

  if (!isValidId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const offset = applyPrivacyOffset(lat as number, lng as number);
  const { tokenHash, setCookie } = createSession(id as string);

  await prisma.presence.upsert({
    where: { id: id as string },
    create: {
      id: id as string,
      lat: offset.lat,
      lng: offset.lng,
      busy: false,
      lastSeen: new Date(),
      tokenHash,
    },
    // Re-entering is a fresh session: new secret, and clear any stuck busy flag.
    update: {
      lat: offset.lat,
      lng: offset.lng,
      lastSeen: new Date(),
      busy: false,
      tokenHash,
    },
  });

  return Response.json(
    { ok: true, id },
    { headers: { "Set-Cookie": setCookie } },
  );
}
