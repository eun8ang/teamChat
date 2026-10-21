// Both conflict-lab branches intentionally edit this one line.
export const CHAT_TITLE = "Team Chat";

export const MAX_MESSAGE_LENGTH = 1_000;
export const MAX_DISPLAY_NAME_LENGTH = 24;
export const MESSAGE_POLL_INTERVAL_MS = 1_500;
export const MESSAGE_REQUEST_TIMEOUT_MS = 10_000;
export const MAX_CLIENT_MESSAGES = 300;
export const IDENTITY_STORAGE_KEY = "team-chat-identity";
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;
export const PRESENCE_REFRESH_INTERVAL_MS = 10_000;
export const PRESENCE_REQUEST_TIMEOUT_MS = 8_000;
// Matches the server's 60-second activity window; older snapshots are no longer shown.
export const PRESENCE_STALE_LIMIT_MS = 60_000;
