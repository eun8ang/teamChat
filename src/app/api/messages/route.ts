import { NextResponse } from "next/server";
import {
  appendChatMessage,
  ChatRateLimitError,
  isValidCursor,
  MessageConflictError,
  readChatMessages,
  type NewChatMessage,
} from "@/server/chat-store";
import {
  errorResponse,
  hasJsonContentType,
  NO_CACHE,
  OversizedBodyError,
  parseDisplayName,
  readBoundedJson,
  requestHasForeignOrigin,
} from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateMessage(value: unknown): NewChatMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.clientId !== "string" || !UUID_PATTERN.test(body.clientId) ||
    typeof body.clientMessageId !== "string" || !UUID_PATTERN.test(body.clientMessageId) ||
    typeof body.content !== "string"
  ) return null;
  const displayName = parseDisplayName(body.displayName);
  const content = body.content.trim();
  if (!displayName || content.length < 1 || content.length > 1_000) return null;
  return {
    clientId: body.clientId.toLowerCase(),
    clientMessageId: body.clientMessageId.toLowerCase(),
    displayName,
    content,
  };
}

export async function GET(request: Request) {
  if (requestHasForeignOrigin(request)) return errorResponse("Use this chat from its own website.", 403);
  const after = new URL(request.url).searchParams.get("after");
  if (after !== null && !isValidCursor(after)) return errorResponse("Invalid message cursor.", 400);

  try {
    const page = await readChatMessages(after ?? undefined);
    return NextResponse.json(page, { headers: NO_CACHE });
  } catch {
    return errorResponse("Shared chat is temporarily unavailable. Please try again shortly.", 503);
  }
}

export async function POST(request: Request) {
  if (requestHasForeignOrigin(request)) return errorResponse("Use this chat from its own website.", 403);
  if (!hasJsonContentType(request)) return errorResponse("Send the message as application/json.", 415);

  let input: NewChatMessage | null;
  try {
    input = validateMessage(await readBoundedJson(request, MAX_BODY_BYTES));
  } catch (error) {
    return errorResponse(
      error instanceof OversizedBodyError ? "Message request is too large." : "Invalid JSON message.",
      error instanceof OversizedBodyError ? 413 : 400,
    );
  }
  if (!input) return errorResponse("Use a name of 1–24 characters and a message of 1–1000 characters with valid client IDs.", 400);

  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0].trim().slice(0, 128) || undefined;
  try {
    const { message, cursor, created } = await appendChatMessage(input, ipAddress);
    return NextResponse.json({ message, cursor }, { status: created ? 201 : 200, headers: NO_CACHE });
  } catch (error) {
    if (error instanceof ChatRateLimitError) {
      return errorResponse(error.message, 429, { "Retry-After": String(Math.ceil(error.retryAfter)) });
    }
    if (error instanceof MessageConflictError) return errorResponse(error.message, 409);
    return errorResponse("Shared chat is temporarily unavailable. Please try again shortly.", 503);
  }
}
