import type { PresenceState } from "@/types/chat";

function countLabel({ status, snapshot }: PresenceState): string {
  if (status === "loading") return "Checking who’s online…";
  if (!snapshot) return "Online count unavailable";
  const sessions = `${snapshot.onlineCount} ${snapshot.onlineCount === 1 ? "session" : "sessions"} online`;
  return status === "stale" ? `${sessions} (may be outdated)` : sessions;
}

// Counts active browser sessions (tabs), not verified people. The live region only
// announces when the visible text changes, not on every heartbeat.
export function OnlineCount({ presence }: { presence: PresenceState }) {
  return (
    <span className={`online-count presence-${presence.status}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      {countLabel(presence)}
    </span>
  );
}
