export interface ChatIdentity {
  clientId: string;
  displayName: string;
}

export interface MessageAttachment {
  id: string;
  alt: string;
  expiresAt: number;
}

export interface ImageDraft { file: File; alt: string }

export interface ChatMessage extends ChatIdentity {
  attachment?: MessageAttachment;
  id: string;
  content: string;
  createdAt: string;
}

export interface MessagesResponse {
  messages: ChatMessage[];
  cursor: string;
}

export interface SendMessageResponse {
  message: ChatMessage;
  cursor: string;
}

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

// Timestamps are Redis server time in epoch milliseconds.
export interface PresenceParticipant extends ChatIdentity {
  connectedAt: number;
  lastSeenAt: number;
}

export interface PresenceSnapshot {
  onlineCount: number;
  observedAt: number;
  participants: PresenceParticipant[];
}

export type PresenceStatus = "loading" | "current" | "stale" | "unavailable";

export interface PresenceState {
  status: PresenceStatus;
  snapshot: PresenceSnapshot | null;
}
