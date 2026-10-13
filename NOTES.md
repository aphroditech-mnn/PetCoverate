# Pulse — Engineering Notes

A short tour of what I changed in each phase and why. Commits are incremental and
phase-scoped (`fix(...)`, `feat(ui)`, `feat(security)`, `feat(vibe)`), so the git
history reads as a narrative.

**How I worked:** I ran the app against a local Postgres (Docker) the whole way
through and verified behaviour with real API calls, not just by reading code. For
the bug hunt + security review I used an adversarial pass — many independent
reviewers surfaced candidate issues, then separate verifiers tried to *refute*
each one — so what's below is de-duplicated and evidence-backed rather than a
checklist of guesses. Every phase kept `tsc`, `eslint`, and `next build` green.

---

## Phase 1 — Make it run

Three bugs broke the core loop; two more made connections fragile.

- **Ghost dots that never leave** *(the symptom described in the brief).*
  `GET /api/poll` heartbeated **every** presence row (`updateMany({ where: {} })`)
  instead of just the caller. With anyone online and polling every 1.5 s, no row
  could ever age past `STALE_MS`, so a user who closed their tab stayed on the map
  forever. → scoped the update to `where: { id }`.
  *Found by* reproducing the symptom, then reading the heartbeat. *Verified:* a
  non-polling peer now disappears within the 15 s window (timed API test).

- **Chat never arrived.** `sendChat()` put `{ t: "msg" }` on the data channel but
  the receiver only accepts `{ t: "chat" }`, so every message was silently
  dropped. The control channel used the matching tag, which is why video worked
  and chat didn't. → aligned the tag to `"chat"`.

- **Stuck "busy" after hanging up.** The signal handler's comment said
  "decline/end free both peers" but only `decline` was implemented. After any
  `end`, both users stayed `busy: true` and couldn't start a new connection until
  their row went stale. → `end` now frees both. *Verified* via API
  (accept → both busy, end → both free).

- **Peer left stranded on tab-close / network drop.** Closing a tab deleted your
  row but never told the person you were talking to, and a failed
  `RTCPeerConnection` didn't free anyone. → `leave` now carries the active
  `peerId` so the server frees that peer and drops an `end` into their mailbox;
  the client sends `end` on a failed connection; re-joining clears a stuck flag.

- **Signaling robustness.** `handleSignal` did `JSON.parse(payload)` with no guard
  (a `null`/garbage payload threw an unhandled rejection that wedged the peer);
  non-string data-channel frames weren't handled; chat echoed locally even if the
  peer had gone. → wrapped parsing, ignore non-string frames, re-check the
  `closed` flag after awaits, only echo when a peer exists.

---

## Phase 2 — Make it good

Direction: **cosmic / aurora dark** — lean all the way into "a living globe."

- **A literal living globe.** Switched Mapbox to `globe` projection with a
  space-fog atmosphere (deep void, indigo horizon glow, stars). The map *is* the
  hero.
- **Presence that feels alive.** Dots are layered radial glows with an expanding
  sonar ring; they scale and brighten on hover, dim cleanly when busy. Your own
  location is a distinct cyan beacon.
- **A real design system** (`globals.css`): deep-space canvas with drifting aurora
  washes + a CSS starfield, glassmorphism surfaces, an aurora gradient for the
  wordmark and primary actions, and a `prefers-reduced-motion` fallback.
- **Motion with intent** (`motion`): a staggered entrance with a pulsing orb on
  the gate; spring-animated chat bubbles; glass modals that scale in/out;
  `AnimatePresence` so overlays leave as gracefully as they arrive; a draggable
  picture-in-picture in the video view.
- **Tightened the flow:** softer toasts ("Reaching out…"), clearer connection
  status, a live "N strangers online" pulse, and trust microcopy that keeps
  reminding people it's anonymous and peer-to-peer.

Thinking: the original was functional but flat. The product's whole promise is
*presence* — strangers being out there, right now — so the redesign spends its
budget on making that feeling tangible (glow, pulse, the globe) while removing
chrome and keeping panels quiet and glassy.

---

## Phase 3 — Make it secure

Reviewed the API as if shipping it. Ranked by real-world blast radius, then fixed
the top tier and hardened the rest.

**P0 — Critical (fixed)**

1. **No identity = total impersonation.** Session ids were client-chosen and
   trusted everywhere, so anyone could act as anyone: forge `fromId`, hijack a
   WebRTC negotiation, flip another user's `busy` flag, or **drain a victim's
   mailbox** with `GET /api/poll?id=<victim>` (reading their inbound SDP/ICE).
   → Minted a per-session secret on join, stored only its SHA-256 on the
   (ephemeral) presence row, and handed the browser an **httpOnly, Secure,
   SameSite=Strict cookie**. Every mutating call now derives identity from that
   cookie: `poll` drains only *your* mailbox, `signal` requires `fromId === you`
   (403 otherwise), `leave` can only remove you. No accounts — but no
   impersonation either.
2. **No rate limiting = trivial DoS.** Nothing stopped join/poll/signal floods
   (and the old global heartbeat amplified every poll into a full-table write).
   → Per-IP sliding-window limits on all four routes + a 128-message mailbox cap
   per recipient. *Caveat:* the limiter is in-memory/per-instance — a first line
   of defence, not a global guarantee; for production back it with Redis / Vercel
   KV (noted in code).

**P1 — High (fixed)**

3. **Weak input validation / mailbox bloat.** Ids were only length-checked on
   `join`; SDP/ICE payloads were unchecked; signals to non-existent users piled
   up until TTL. → 8–64 id checks everywhere, structural validation of
   offer/answer/ice payloads, target-existence checks for *all* signal types, a
   response cap on the peer list.
4. **Session id leaked via URL.** `poll` sent `?id=` (lands in history/proxy
   logs). → identity is the cookie now; the id is out of the URL.

**P2 — Noted (deliberate / deferred)**

- **Global peer list** is a *product* decision — it's a world map you can pan.
  De-anonymisation is already defeated by the fresh 1–3 km per-session offset
  (no cross-session identity to triangulate); I added a result cap + rate limit as
  scale/enumeration safety valves.
- **`accept` isn't atomic** server-side; the client state machine + auth make it
  low-risk. A DB-level one-connection constraint would close it fully.
- **Session-id collision.** A peer you've connected to learns your id, and
  `join` upserts by id, so they could re-`join` as you and invalidate your
  session. They still *can't act as you* (the cookie, not the id, is the
  credential), so it's a transient self-healing DoS — the victim just 401s and
  auto-rejoins. Rate limiting + the 15 s reap bound it; a create-only guard would
  close it but risks locking out the legitimate reconnect path, so I left it.
- **CSP** is deferred — a correct policy needs careful allow-listing for Mapbox
  GL's workers/blobs and tile hosts. I added the cheap headers now
  (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`, HSTS).

**Explicitly *not* bugs** (verified and dismissed, so time went to real issues):
chat XSS (React escapes text; no `dangerouslySetInnerHTML`), CSS injection via dot
colour (the hash sanitises), location triangulation (per-session offset + no
durable identity), the public `NEXT_PUBLIC_MAPBOX_TOKEN` (standard for client-side
GL; restrict it by URL in the Mapbox dashboard), and CSRF (the new cookie is
`SameSite=Strict`).

---

## Phase 4 — Make it better: **Vibes**

**What:** when you drop onto the globe you can pick a one-word *vibe* — chatty,
chill, curious, playful, deep, creative, night owl, just-hi. It:

- **colours your dot** (and your beacon) so the map reads as a field of moods;
- drives a **live legend/filter** — tap a vibe and matching dots stay lit while
  the rest fade, so you can *see* your tribe;
- powers **"Connect me with someone"** — one tap drops you into a connection with
  a random free stranger, preferring the vibe you've spotlighted.

**Why:** the map was beautiful but passive — you had to already see a dot and
decide to tap it. Vibes make the globe feel *alive and intentional*: presence now
carries a hint of personality, and serendipity matchmaking gives a zero-friction
way to meet someone when you don't want to pick. It's curated on purpose — fixed
keys mean consistent colours **and** no free-text field to abuse or moderate,
which keeps an anonymous app safe. Fully validated server-side.

**What I'd do next with more time:** server-side matchmaking so "connect me" can
reach the whole globe (not just dots on your screen) via a short-lived queue;
ambient join/leave ripples and vibe-tinted pulses for even more life; a vibe that
gently decays so the map reflects *now*; and a lightweight ephemeral report/block
to round out safety.

---

## Running it locally

```bash
npm install
cp .env.example .env     # set DATABASE_URL (Postgres) + NEXT_PUBLIC_MAPBOX_TOKEN
npx prisma db push       # creates Presence + Signal (now incl. tokenHash, vibe)
npm run dev              # http://localhost:3000
```

Open two browser profiles, set a different mock geolocation in each
(DevTools → Sensors), pick vibes, and connect. The map needs a real Mapbox token;
without one you'll get a friendly hint instead of a broken globe.

## Assumptions & limitations

- **STUN-only** (no TURN) — a few strict networks won't establish media, per the
  brief.
- The **rate limiter is per-instance** (see Phase 3) — fine for the assessment,
  swap for a shared store at scale.
- The global peer list is intentional (it's a world map); privacy rests on the
  per-session offset + statelessness.
