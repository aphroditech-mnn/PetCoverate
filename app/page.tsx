"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import VibeBar from "./components/VibeBar";
import { join, leave, poll, sendSignal, SessionExpiredError } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [myVibe, setMyVibe] = useState<string | null>(null);
  const [vibeFilter, setVibeFilter] = useState<string | null>(null);

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationRef = useRef(myLocation);
  useEffect(() => {
    locationRef.current = myLocation;
  }, [myLocation]);
  const vibeRef = useRef(myVibe);
  useEffect(() => {
    vibeRef.current = myVibe;
  }, [myVibe]);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          // Tell the peer so the server frees both busy flags; otherwise a
          // network drop leaves us stuck "busy" until the stale timeout.
          void sendSignal(sessionId, peerId, "end");
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(sessionId, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(sessionId, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll();
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
      } catch (err) {
        // Session lapsed (e.g. tab slept past the stale window) — re-join with
        // our last known location to re-establish presence + cookie.
        if (err instanceof SessionExpiredError && locationRef.current) {
          try {
            await join(
              sessionId,
              locationRef.current.lat,
              locationRef.current.lng,
              vibeRef.current, // keep the user's vibe across a reconnect
            );
          } catch {}
        }
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => {
      const c = connRef.current;
      const peerId =
        c.kind === "connecting" || c.kind === "connected" ? c.peerId : undefined;
      leave(sessionId, peerId);
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId, phase]);

  async function handleReady(lat: number, lng: number, vibe: string | null) {
    setMyLocation({ lat, lng });
    setMyVibe(vibe);
    await join(sessionId, lat, lng, vibe);
    setPhase("live");
  }

  // Serendipity: connect me with a random free stranger — preferring the vibe
  // I've spotlighted, falling back to anyone available.
  function connectRandom() {
    if (connRef.current.kind !== "idle") return;
    const free = peers.filter((p) => !p.busy);
    const matching = vibeFilter
      ? free.filter((p) => p.vibe === vibeFilter)
      : [];
    const pool = matching.length > 0 ? matching : free;
    if (pool.length === 0) {
      showNotice("No one free to connect right now — hang tight.");
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    requestConnection(pick.id);
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        meVibe={myVibe}
        vibeFilter={vibeFilter}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {conn.kind === "idle" && (
        <VibeBar
          peers={peers}
          meVibe={myVibe}
          active={vibeFilter}
          onSelect={setVibeFilter}
        />
      )}

      <AnimatePresence>
        {conn.kind === "idle" && (
          <motion.div
            key="surprise"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4"
          >
            <motion.button
              onClick={connectRandom}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="btn-aurora pointer-events-auto flex items-center gap-2 rounded-full px-6 py-3 text-sm shadow-xl"
            >
              <span aria-hidden>✨</span>
              {vibeFilter
                ? "Connect me with this vibe"
                : "Connect me with someone"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            key="notice"
            initial={{ opacity: 0, x: "-50%", y: -12, scale: 0.96 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", y: -12, scale: 0.96 }}
            className="glass absolute left-1/2 top-20 z-30 rounded-full px-4 py-2 text-sm text-zinc-100"
          >
            {notice}
          </motion.div>
        )}

        {conn.kind === "requesting" && (
          <motion.div
            key="requesting"
            initial={{ opacity: 0, x: "-50%", y: -12, scale: 0.96 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", y: -12, scale: 0.96 }}
            className="glass absolute left-1/2 top-20 z-30 flex items-center gap-3 rounded-full py-2 pl-4 pr-2 text-sm text-zinc-100"
          >
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-300" />
              </span>
              Reaching out…
            </span>
            <button
              onClick={cancelRequest}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs transition hover:bg-white/10"
            >
              Cancel
            </button>
          </motion.div>
        )}

        {conn.kind === "incoming" && (
          <ConnectionPrompt
            key="incoming"
            title="A stranger wants to connect"
            subtitle="Accept to open a private, peer-to-peer chat."
            acceptLabel="Accept"
            declineLabel="Decline"
            onAccept={acceptIncoming}
            onDecline={declineIncoming}
          />
        )}

        {inChat && (
          <ChatPanel
            key="chat"
            messages={messages}
            connected={conn.kind === "connected"}
            videoBusy={video !== "none"}
            onSend={(text) => {
              // Only echo locally if we actually have a peer to send to, so a
              // message never "appears sent" after the connection dropped.
              if (!peerRef.current) return;
              peerRef.current.sendChat(text);
              addMessage(true, text);
            }}
            onStartVideo={startVideoRequest}
            onEnd={endConnection}
          />
        )}

        {video === "requesting" && (
          <motion.div
            key="vreq"
            initial={{ opacity: 0, x: "-50%", y: 12, scale: 0.96 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", y: 12, scale: 0.96 }}
            className="glass absolute bottom-24 left-1/2 z-30 rounded-full px-4 py-2 text-sm text-zinc-100"
          >
            Waiting for stranger to accept video…
          </motion.div>
        )}

        {video === "incoming" && (
          <ConnectionPrompt
            key="vincoming"
            title="Start video call?"
            subtitle="The stranger wants to turn on their camera."
            acceptLabel="Accept"
            declineLabel="Decline"
            onAccept={acceptVideo}
            onDecline={declineVideo}
          />
        )}

        {video === "active" && (
          <VideoPanel
            key="video"
            localStream={localStream}
            remoteStream={remoteStream}
            onEnd={endVideo}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
