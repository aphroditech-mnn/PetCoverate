"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex flex-col bg-[#04050c]"
    >
      <div className="relative flex-1 overflow-hidden">
        {/* Remote (full screen) */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="h-full w-full bg-[#070916] object-cover"
        />
        {!remoteStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[color:var(--muted)]">
            <span className="relative flex h-14 w-14">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/30" />
              <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400/10 text-xl">
                🎥
              </span>
            </span>
            Waiting for stranger&rsquo;s video…
          </div>
        )}

        {/* Top gradient for legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.7)]" />
          Live · peer-to-peer
        </div>

        {/* Local (picture-in-picture) */}
        <motion.video
          drag
          dragMomentum={false}
          ref={localRef}
          autoPlay
          playsInline
          muted
          whileDrag={{ scale: 1.04 }}
          className="absolute bottom-28 right-5 h-40 w-28 cursor-grab rounded-2xl border border-white/20 bg-[#070916] object-cover shadow-2xl active:cursor-grabbing"
        />
      </div>

      <div className="flex justify-center bg-gradient-to-t from-black/70 to-transparent p-6">
        <button
          onClick={onEnd}
          className="flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/20 px-8 py-3.5 font-semibold text-red-100 backdrop-blur-md transition hover:bg-red-500/30"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          End video
        </button>
      </div>
    </motion.div>
  );
}
