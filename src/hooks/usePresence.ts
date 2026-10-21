"use client";

import { useEffect, useRef, useState } from "react";
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_REFRESH_INTERVAL_MS,
  PRESENCE_REQUEST_TIMEOUT_MS,
  PRESENCE_STALE_LIMIT_MS,
} from "@/config/chat";
import { parsePresenceSnapshot } from "@/lib/presence";
import type { ChatIdentity, PresenceState } from "@/types/chat";

// Create one instance per page. A joined, visible tab sends a heartbeat on join,
// on resume, and every 20 seconds; between heartbeats it refreshes the snapshot
// every 10 seconds. Visitors only read. Hidden tabs send nothing and expire on the server.
export function usePresence(identity: ChatIdentity | null): PresenceState {
  const [state, setState] = useState<PresenceState>({ status: "loading", snapshot: null });
  const receivedAt = useRef<number | null>(null);
  const clientId = identity?.clientId;
  const displayName = identity?.displayName;

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let queued = false;
    let nextHeartbeatAt = 0;
    let controller: AbortController | null = null;
    let requestTimeout: ReturnType<typeof setTimeout> | null = null;

    async function sync() {
      if (stopped || document.visibilityState === "hidden") return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      const heartbeat = clientId !== undefined && Date.now() >= nextHeartbeatAt;
      controller = new AbortController();
      const requestController = controller;
      requestTimeout = setTimeout(() => { requestController.abort(); }, PRESENCE_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch("/api/presence", heartbeat
          ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, displayName }), cache: "no-store", signal: controller.signal }
          : { cache: "no-store", signal: controller.signal });
        if (heartbeat && response.status === 429) {
          // The room is full: stay a visitor until the server's retry hint, but keep reading.
          const retryAfter = Number(response.headers.get("Retry-After"));
          nextHeartbeatAt = Date.now() + (retryAfter > 0 ? retryAfter * 1_000 : PRESENCE_HEARTBEAT_INTERVAL_MS);
          queued = true;
          return;
        }
        if (!response.ok) throw new Error("Presence request failed.");
        const snapshot = parsePresenceSnapshot(await response.json());
        if (!snapshot) throw new Error("Presence response was invalid.");
        if (stopped) return;
        if (heartbeat) nextHeartbeatAt = Date.now() + PRESENCE_HEARTBEAT_INTERVAL_MS;
        receivedAt.current = Date.now();
        setState({ status: "current", snapshot });
      } catch {
        if (stopped) return;
        // Keep a recent snapshot only as explicitly stale; never present failure as zero.
        const usable = receivedAt.current !== null && Date.now() - receivedAt.current < PRESENCE_STALE_LIMIT_MS;
        setState((current) => usable && current.snapshot
          ? { status: "stale", snapshot: current.snapshot }
          : { status: "unavailable", snapshot: null });
      } finally {
        if (requestTimeout !== null) clearTimeout(requestTimeout);
        inFlight = false;
        if (queued && !stopped) { queued = false; void sync(); }
      }
    }

    void sync();
    const interval = setInterval(() => { void sync(); }, PRESENCE_REFRESH_INTERVAL_MS);
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      nextHeartbeatAt = 0;
      void sync();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      clearInterval(interval);
      controller?.abort();
      if (requestTimeout !== null) clearTimeout(requestTimeout);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [clientId, displayName]);

  return state;
}
