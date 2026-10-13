"use client";

import { useState } from "react";
import { motion } from "motion/react";

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => onReady(pos.coords.latitude, pos.coords.longitude),
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
        className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2"
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
          <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_30px_10px_rgba(56,189,248,0.7)]" />
        </div>
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center text-center"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
        }}
      >
        {[
          <h1
            key="title"
            className="aurora-text text-6xl font-bold tracking-tight drop-shadow-[0_0_30px_rgba(168,85,247,0.35)] sm:text-7xl"
          >
            Pulse
          </h1>,
          <p
            key="tag"
            className="mt-4 max-w-md text-lg text-[color:var(--muted)]"
          >
            A living globe of anonymous strangers.
            <br />
            Find a glowing dot. Say hello.
          </p>,
          <div key="cta" className="mt-9">
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
          </div>,
        ].map((child, i) => (
          <motion.div
            key={i}
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { ease: "easeOut" } },
            }}
          >
            {child}
          </motion.div>
        ))}
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
        className="relative z-10 mt-16 flex max-w-sm items-center gap-2 text-center text-xs text-[color:var(--muted)]/80"
      >
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300 shadow-[0_0_8px_2px_rgba(45,212,191,0.6)]" />
        No sign-up. Your dot sits 1–3&nbsp;km off your real spot. Chat &amp; video
        are peer-to-peer — nothing is stored.
      </motion.p>
    </div>
  );
}
