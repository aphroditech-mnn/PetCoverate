"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { VIBES } from "@/lib/vibes";

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number, vibe: string | null) => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [vibe, setVibe] = useState<string | null>(null);

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => onReady(pos.coords.latitude, pos.coords.longitude, vibe),
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        );
      },
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const locating = status === "locating";

  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden p-6">
      <div className="stars" />
      <div className="aurora opacity-70" />

      {/* Living pulse orb behind the wordmark */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      >
        <div className="relative h-56 w-56">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.55),rgba(56,189,248,0.15)_55%,transparent_72%)] blur-xl" />
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border border-fuchsia-300/30"
              animate={{ scale: [1, 2.1], opacity: [0.5, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 1,
                ease: "easeOut",
              }}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        className="relative z-10 flex w-full max-w-lg flex-col items-center text-center"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
        }}
      >
        <Stagger>
          <h1 className="aurora-text text-6xl font-bold tracking-tight drop-shadow-[0_0_30px_rgba(168,85,247,0.35)] sm:text-7xl">
            Pulse
          </h1>
        </Stagger>
        <Stagger>
          <p className="mt-4 max-w-md text-lg text-[color:var(--muted)]">
            A living globe of anonymous strangers.
            <br />
            Find a glowing dot. Say hello.
          </p>
        </Stagger>

        {/* Vibe picker */}
        <Stagger>
          <div className="mt-8 w-full">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--muted)]/80">
              Pick a vibe · optional
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {VIBES.map((v) => {
                const active = vibe === v.key;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setVibe(active ? null : v.key)}
                    style={
                      active
                        ? {
                            borderColor: v.color,
                            boxShadow: `0 0 18px -4px ${v.color}`,
                            background: `${v.color}1f`,
                          }
                        : undefined
                    }
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition ${
                      active
                        ? "text-white"
                        : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/25 hover:bg-white/10"
                    }`}
                  >
                    <span>{v.emoji}</span>
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Stagger>

        <Stagger>
          <div className="mt-9">
            <button
              onClick={enter}
              disabled={locating}
              className="btn-aurora group relative inline-flex items-center gap-2.5 rounded-full px-9 py-3.5 text-base disabled:cursor-wait disabled:opacity-70"
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full bg-current ${
                  locating ? "animate-ping" : ""
                }`}
              />
              {locating ? "Finding you…" : "Enter Pulse"}
            </button>
          </div>
        </Stagger>
      </motion.div>

      {status === "error" && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mt-6 max-w-sm rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-200"
        >
          {error}
        </motion.p>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="relative z-10 mt-14 max-w-sm text-center text-xs leading-relaxed text-[color:var(--muted)]/80"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-teal-300 align-middle shadow-[0_0_8px_2px_rgba(45,212,191,0.6)]" />
        No sign-up. Your dot sits 1–3&nbsp;km off your real spot. Chat &amp; video
        are peer-to-peer — nothing is stored.
      </motion.p>
    </div>
  );
}

function Stagger({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { ease: "easeOut" } },
      }}
    >
      {children}
    </motion.div>
  );
}
