import { NextResponse } from "next/server";
import { isValidClientId } from "@/lib/message";
import {
  errorResponse,
  hasJsonContentType,
  NO_CACHE,
  OversizedBodyError,
  parseDisplayName,
  readBoundedJson,
  requestHasForeignOrigin,
} from "@/server/http";
import { PresenceCapacityError, readPresence, recordPresenceHeartbeat } from "@/server/presence-store";
import type { ChatIdentity } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_048;
const UNAVAILABLE = "Presence is temporarily unavailable. Please try again shortly.";

// The clientId is self-declared by the tab; it identifies a session, not a verified person.
function validateHeartbeat(value: unknown): ChatIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.clientId !== "string" || !isValidClientId(body.clientId)) return null;
  const displayName = parseDisplayName(body.displayName);
  return displayName ? { clientId: body.clientId.toLowerCase(), displayName } : null;
}

export async function GET(request: Request) {
  if (requestHasForeignOrigin(request)) return errorResponse("Use this chat from its own website.", 403);
  try {
    return NextResponse.json(await readPresence(), { headers: NO_CACHE });
  } catch {
    return errorResponse(UNAVAILABLE, 503);
  }
}

export async function PUT(request: Request) {
  if (requestHasForeignOrigin(request)) return errorResponse("Use this chat from its own website.", 403);
  if (!hasJsonContentType(request)) return errorResponse("Send the heartbeat as application/json.", 415);

  let identity: ChatIdentity | null;
  try {
    identity = validateHeartbeat(await readBoundedJson(request, MAX_BODY_BYTES));
  } catch (error) {
    return errorResponse(
      error instanceof OversizedBodyError ? "Heartbeat request is too large." : "Invalid JSON heartbeat.",
      error instanceof OversizedBodyError ? 413 : 400,
    );
  }
  if (!identity) return errorResponse("Use a valid client ID and a name of 1–24 characters.", 400);

  try {
    return NextResponse.json(await recordPresenceHeartbeat(identity), { headers: NO_CACHE });
  } catch (error) {
    if (error instanceof PresenceCapacityError) {
      return errorResponse(error.message, 429, { "Retry-After": String(Math.ceil(error.retryAfter)) });
    }
    return errorResponse(UNAVAILABLE, 503);
  }
}
