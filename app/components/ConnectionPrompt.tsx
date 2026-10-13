"use client";

import { motion } from "motion/react";

// Reusable centered prompt for "someone wants to connect" and
// "someone wants to start video".
export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: "spring", stiffness: 340, damping: 26 }}
        className="glass-strong w-full max-w-xs rounded-3xl p-7 text-center text-zinc-100"
      >
        {/* Pulsing beacon */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400/40" />
            <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.95),rgba(56,189,248,0.5))] shadow-[0_0_30px_6px_rgba(168,85,247,0.5)]">
              <span className="h-3 w-3 rounded-full bg-white" />
            </span>
          </span>
        </div>

        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && (
          <p className="mt-1.5 text-sm text-[color:var(--muted)]">{subtitle}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-white/30 hover:bg-white/10"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            className="btn-aurora flex-1 rounded-full px-4 py-2.5 text-sm"
          >
            {acceptLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
