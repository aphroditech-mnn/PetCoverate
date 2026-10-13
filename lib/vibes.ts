// Vibes — the heart of the "feel more alive" feature. Each person optionally
// picks a one-word vibe when they drop onto the globe. It colours their dot and
// lets strangers find like-minded strangers (and powers "connect me with
// someone"). Curated, not free-text: consistent colours, zero moderation
// surface, nothing to abuse.

export interface Vibe {
  key: string;
  label: string;
  emoji: string;
  color: string; // hex — drives the dot glow + legend chip
}

export const VIBES: Vibe[] = [
  { key: "chatty", label: "Chatty", emoji: "💬", color: "#f59e0b" },
  { key: "chill", label: "Chill", emoji: "🌊", color: "#38bdf8" },
  { key: "curious", label: "Curious", emoji: "🔭", color: "#a855f7" },
  { key: "playful", label: "Playful", emoji: "✨", color: "#ec4899" },
  { key: "deep", label: "Deep", emoji: "🌌", color: "#6366f1" },
  { key: "creative", label: "Creative", emoji: "🎨", color: "#2dd4bf" },
  { key: "night", label: "Night owl", emoji: "🌙", color: "#818cf8" },
  { key: "hello", label: "Just hi", emoji: "👋", color: "#34d399" },
];

const BY_KEY = new Map(VIBES.map((v) => [v.key, v]));

export function isValidVibe(v: unknown): v is string {
  return typeof v === "string" && BY_KEY.has(v);
}

export function vibeByKey(key: string | null | undefined): Vibe | undefined {
  return key ? BY_KEY.get(key) : undefined;
}
