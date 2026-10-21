import { isValidClientId, isValidDisplayName } from "@/lib/message";
import type { PresenceParticipant, PresenceSnapshot } from "@/types/chat";

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseParticipant(value: unknown): PresenceParticipant | null {
  if (!value || typeof value !== "object") return null;
  const { clientId, displayName, connectedAt, lastSeenAt } = value as Record<string, unknown>;
  if (
    typeof clientId !== "string" || !isValidClientId(clientId) ||
    typeof displayName !== "string" || !isValidDisplayName(displayName) ||
    !isTimestamp(connectedAt) || !isTimestamp(lastSeenAt) || connectedAt > lastSeenAt
  ) return null;
  return { clientId, displayName, connectedAt, lastSeenAt };
}

// Returns a sanitized copy of a presence response, or null if any part is malformed.
export function parsePresenceSnapshot(value: unknown): PresenceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const { onlineCount, observedAt, participants } = value as Record<string, unknown>;
  if (!isTimestamp(observedAt) || !Array.isArray(participants) || onlineCount !== participants.length) return null;
  const parsed: PresenceParticipant[] = [];
  for (const participant of participants) {
    const valid = parseParticipant(participant);
    if (!valid) return null;
    parsed.push(valid);
  }
  return { onlineCount, observedAt, participants: parsed };
}

export function displayInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase("en-US") ?? "?";
}
