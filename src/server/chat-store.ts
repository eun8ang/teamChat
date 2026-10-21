import { createHash } from "node:crypto";
import type { ChatMessage } from "@/types/chat";
import { redisCommand, RedisUnavailableError } from "@/server/redis";
import { roomKeyPrefix } from "@/server/room";

const HISTORY_LIMIT = 100;
const MAX_RETAINED_MESSAGES = 500;
const ROOM_TTL_SECONDS = 24 * 60 * 60;
const RATE_WINDOW_MS = 10_000;
const CLIENT_RATE_LIMIT = 5;
const IP_RATE_LIMIT = 100;

export interface NewChatMessage {
  clientId: string;
  clientMessageId: string;
  displayName: string;
  content: string;
}

export interface MessagePage {
  messages: ChatMessage[];
  cursor: string;
}

export class ChatRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super("Too many messages. Please wait a moment.");
    this.name = "ChatRateLimitError";
  }
}

export class MessageConflictError extends Error {
  constructor() {
    super("This message ID was already used for different content.");
    this.name = "MessageConflictError";
  }
}

export function isValidCursor(value: string): boolean {
  if (!/^(0|[1-9][0-9]{0,19})-(0|[1-9][0-9]{0,19})$/.test(value)) return false;
  const maximum = BigInt("18446744073709551615");
  return value.split("-").every((part) => BigInt(part) <= maximum);
}

function parseStoredMessage(value: unknown): ChatMessage {
  if (!value || typeof value !== "object") throw new RedisUnavailableError();
  const message = value as Record<string, unknown>;
  if (
    typeof message.id !== "string" || !isValidCursor(message.id) ||
    typeof message.clientId !== "string" ||
    typeof message.displayName !== "string" ||
    typeof message.content !== "string" ||
    typeof message.createdAt !== "string" || Number.isNaN(Date.parse(message.createdAt))
  ) throw new RedisUnavailableError();
  return {
    id: message.id,
    clientId: message.clientId,
    displayName: message.displayName,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function parseStreamEntry(entry: unknown): ChatMessage {
  if (!Array.isArray(entry) || entry.length !== 2 || !Array.isArray(entry[1])) {
    throw new RedisUnavailableError();
  }
  const [id, fields] = entry as [unknown, unknown[]];
  if (fields.length % 2 !== 0) throw new RedisUnavailableError();
  const message: Record<string, unknown> = { id };
  for (let index = 0; index < fields.length; index += 2) {
    if (typeof fields[index] !== "string") throw new RedisUnavailableError();
    message[fields[index] as string] = fields[index + 1];
  }
  return parseStoredMessage(message);
}

export async function readChatMessages(after?: string): Promise<MessagePage> {
  const key = `${roomKeyPrefix()}:messages`;
  const entries = await redisCommand<unknown[]>(
    after
      ? ["XRANGE", key, `(${after}`, "+", "COUNT", HISTORY_LIMIT]
      : ["XREVRANGE", key, "+", "-", "COUNT", HISTORY_LIMIT],
  );
  if (!Array.isArray(entries)) throw new RedisUnavailableError();
  const messages = entries.map(parseStreamEntry);
  if (!after) messages.reverse();
  return { messages, cursor: messages.at(-1)?.id || after || "0-0" };
}

// Deduplication, both rate limits, append, exact trimming, and expiry are one
// atomic operation. A retried request returns its original server timestamp/ID.
export const APPEND_MESSAGE_SCRIPT = `
local previous = redis.call('GET', KEYS[2])
if previous then
  local record = cjson.decode(previous)
  if record.fingerprint ~= ARGV[5] then return {'conflict'} end
  return {'duplicate', cjson.encode(record.message)}
end

local clientCount = tonumber(redis.call('GET', KEYS[3]) or '0')
local ipEnabled = ARGV[6] == '1'
local ipCount = 0
if ipEnabled then ipCount = tonumber(redis.call('GET', KEYS[4]) or '0') end
local waitMs = 0
if clientCount >= tonumber(ARGV[8]) then
  waitMs = math.max(waitMs, redis.call('PTTL', KEYS[3]))
end
if ipEnabled and ipCount >= tonumber(ARGV[9]) then
  waitMs = math.max(waitMs, redis.call('PTTL', KEYS[4]))
end
if clientCount >= tonumber(ARGV[8]) or (ipEnabled and ipCount >= tonumber(ARGV[9])) then
  return {'rate_limited', tostring(math.max(1, math.ceil(waitMs / 1000)))}
end

redis.call('INCR', KEYS[3])
if clientCount == 0 then redis.call('PEXPIRE', KEYS[3], ARGV[7]) end
if ipEnabled then
  redis.call('INCR', KEYS[4])
  if ipCount == 0 then redis.call('PEXPIRE', KEYS[4], ARGV[7]) end
end

local id = redis.call('XADD', KEYS[1], 'MAXLEN', '=', ARGV[10], '*',
  'clientId', ARGV[1], 'displayName', ARGV[2], 'content', ARGV[3], 'createdAt', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[11])
local message = {id = id, clientId = ARGV[1], displayName = ARGV[2], content = ARGV[3], createdAt = ARGV[4]}
redis.call('SET', KEYS[2], cjson.encode({fingerprint = ARGV[5], message = message}), 'EX', ARGV[11])
return {'created', cjson.encode(message)}
`;

export async function appendChatMessage(
  input: NewChatMessage,
  ipAddress?: string,
): Promise<{ message: ChatMessage; cursor: string; created: boolean }> {
  const prefix = roomKeyPrefix();
  const ipHash = ipAddress
    ? createHash("sha256").update(`${prefix}|${ipAddress}`).digest("hex").slice(0, 32)
    : "none";
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ displayName: input.displayName, content: input.content }))
    .digest("hex");
  const result = await redisCommand<unknown[]>([
    "EVAL", APPEND_MESSAGE_SCRIPT, 4,
    `${prefix}:messages`,
    `${prefix}:dedupe:${input.clientId}:${input.clientMessageId}`,
    `${prefix}:rate:client:${input.clientId}`,
    `${prefix}:rate:ip:${ipHash}`,
    input.clientId, input.displayName, input.content, new Date().toISOString(), fingerprint,
    ipAddress ? "1" : "0", RATE_WINDOW_MS, CLIENT_RATE_LIMIT, IP_RATE_LIMIT,
    MAX_RETAINED_MESSAGES, ROOM_TTL_SECONDS,
  ]);

  if (!Array.isArray(result)) throw new RedisUnavailableError();
  if (result[0] === "conflict") throw new MessageConflictError();
  if (result[0] === "rate_limited") {
    const retryAfter = Number(result[1]);
    throw new ChatRateLimitError(Number.isFinite(retryAfter) ? Math.max(1, retryAfter) : 10);
  }
  if ((result[0] !== "created" && result[0] !== "duplicate") || typeof result[1] !== "string") {
    throw new RedisUnavailableError();
  }
  let message: ChatMessage;
  try {
    message = parseStoredMessage(JSON.parse(result[1]));
  } catch {
    throw new RedisUnavailableError();
  }
  return { message, cursor: message.id, created: result[0] === "created" };
}
