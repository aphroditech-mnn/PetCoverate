"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";
import { vibeByKey } from "@/lib/vibes";

const RAW_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
// Treat the .env.example placeholder as "no token" so dev shows a helpful hint
// instead of a silently-broken globe.
const TOKEN =
  RAW_TOKEN.startsWith("pk.") && !RAW_TOKEN.includes("your_mapbox_token")
    ? RAW_TOKEN
    : "";

function dotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 85%, 68%)`;
}

export default function WorldMap({
  peers,
  me,
  meVibe,
  vibeFilter,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  meVibe: string | null;
  vibeFilter: string | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe", // true 3D globe — the "living globe" centrepiece
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 3.2 : 1.6,
        attributionControl: true,
      });
      map.on("style.load", () => {
        // Space atmosphere: deep void + a soft indigo horizon glow + stars.
        map.setFog({
          color: "rgb(14, 17, 38)",
          "high-color": "rgb(60, 70, 160)",
          "horizon-blend": 0.08,
          "space-color": "rgb(4, 5, 12)",
          "star-intensity": 0.5,
        });
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / move the user's own "you are here" beacon.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const emoji = vibeByKey(meVibe)?.emoji ?? "";
      const label = `<span class="pulse-me-label">You${emoji ? ` ${emoji}` : ""}</span>`;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        el.innerHTML = label;
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
        meMarkerRef.current.getElement().innerHTML = label;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, meVibe, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.className = "pulse-dot";
          el.style.setProperty(
            "--dot",
            vibeByKey(peer.vibe)?.color ?? dotColor(peer.id),
          );
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        const el = marker.getElement();
        el.classList.toggle("is-busy", peer.busy);
        // Dim dots that don't match an active vibe filter.
        el.classList.toggle(
          "dimmed",
          !!vibeFilter && peer.vibe !== vibeFilter,
        );
        const vibeLabel = vibeByKey(peer.vibe)?.label;
        el.title = peer.busy
          ? "In a connection"
          : `Tap to connect${vibeLabel ? ` · ${vibeLabel}` : ""}`;
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready, vibeFilter]);

  const others = peers.length;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-[#04050c]" />

      {/* Atmospheric vignette + aurora rim over the map. */}
      {TOKEN && <div className="map-atmosphere" />}

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div className="stars" />
          <div className="aurora opacity-60" />
          <div className="glass relative z-10 max-w-md rounded-2xl p-6 text-sm text-zinc-200">
            <p className="aurora-text mb-2 text-lg font-semibold">Almost there</p>
            <p>
              Set{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-teal-300">
                NEXT_PUBLIC_MAPBOX_TOKEN
              </code>{" "}
              in <code className="rounded bg-white/10 px-1.5 py-0.5">.env</code> to
              load the globe.
            </p>
          </div>
        </div>
      )}

      {/* Brand chip */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2">
        <span className="aurora-text text-lg font-bold tracking-tight">Pulse</span>
      </div>

      {/* Live online count */}
      <div className="absolute bottom-5 left-4 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(10,13,30,0.6)] px-3.5 py-1.5 text-xs text-zinc-200 backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-300" />
        </span>
        <span className="font-medium text-white">{others}</span>
        <span className="text-zinc-400">
          {others === 1 ? "stranger" : "strangers"} online
        </span>
      </div>
    </div>
  );
}
