"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0.5 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 36 }}
      className="glass-strong absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col sm:rounded-l-3xl"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.9),rgba(56,189,248,0.4))] blur-[2px]" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          <div>
            <p className="font-semibold leading-tight text-white">Stranger</p>
            <p className="flex items-center gap-1.5 text-xs text-[color:var(--muted)]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected
                    ? "bg-teal-300 shadow-[0_0_6px_1px_rgba(45,212,191,0.8)]"
                    : "animate-pulse bg-amber-300"
                }`}
              />
              {connected ? "Connected · peer-to-peer" : "Connecting…"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            title="Start video"
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-zinc-100 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
          >
            Video
          </button>
          <button
            onClick={onEnd}
            className="rounded-full border border-red-400/30 bg-red-500/15 px-3.5 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-500/25"
          >
            End
          </button>
        </div>
      </header>

      <div className="thin-scroll flex-1 space-y-2.5 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <span className="text-2xl">👋</span>
            <p className="max-w-[16rem] text-sm text-[color:var(--muted)]">
              Say hello. Messages travel directly between you two and are never
              stored.
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
            >
              <span
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                  m.mine
                    ? "rounded-br-md bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-[#0a0a14]"
                    : "rounded-bl-md border border-white/10 bg-white/8 text-zinc-100"
                }`}
              >
                {m.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-white/10 p-3.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          disabled={!connected}
          className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-fuchsia-300/50 focus:bg-white/10 focus:ring-2 focus:ring-fuchsia-400/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="btn-aurora rounded-full px-5 py-2.5 text-sm disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </motion.div>
  );
}
