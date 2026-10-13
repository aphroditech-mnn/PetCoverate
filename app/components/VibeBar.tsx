"use client";

import { motion } from "motion/react";
import { VIBES } from "@/lib/vibes";
import type { PeerDot } from "@/lib/types";

// Live legend + filter. Shows the vibes currently out on the globe (with
// counts) and lets you spotlight one — matching dots stay lit, the rest fade.
export default function VibeBar({
  peers,
  meVibe,
  active,
  onSelect,
}: {
  peers: PeerDot[];
  meVibe: string | null;
  active: string | null;
  onSelect: (key: string | null) => void;
}) {
  const counts = new Map<string, number>();
  for (const p of peers) {
    if (p.vibe) counts.set(p.vibe, (counts.get(p.vibe) ?? 0) + 1);
  }

  // Show vibes present among peers, plus always your own so you can find your
  // tribe even before anyone matches.
  const present = VIBES.filter((v) => counts.has(v.key) || v.key === meVibe);
  if (present.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto absolute left-1/2 top-4 z-20 flex max-w-[92vw] -translate-x-1/2 flex-wrap justify-center gap-1.5"
    >
      {present.map((v) => {
        const n = counts.get(v.key) ?? 0;
        const isActive = active === v.key;
        const mine = v.key === meVibe;
        return (
          <button
            key={v.key}
            onClick={() => onSelect(isActive ? null : v.key)}
            title={mine ? "Your vibe" : undefined}
            style={
              isActive
                ? {
                    borderColor: v.color,
                    background: `${v.color}26`,
                    boxShadow: `0 0 16px -4px ${v.color}`,
                  }
                : undefined
            }
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs backdrop-blur-md transition ${
              isActive
                ? "text-white"
                : "border-white/10 bg-[rgba(10,13,30,0.55)] text-zinc-300 hover:bg-white/10"
            }`}
          >
            <span aria-hidden>{v.emoji}</span>
            <span>{v.label}</span>
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-zinc-200">
              {n}
            </span>
            {mine && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: v.color }}
              />
            )}
          </button>
        );
      })}
    </motion.div>
  );
}
