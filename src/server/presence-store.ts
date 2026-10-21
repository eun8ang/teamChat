import type { ChatIdentity, PresenceParticipant, PresenceSnapshot } from "@/types/chat";
import { redisCommand, RedisUnavailableError } from "@/server/redis";
import { roomKeyPrefix } from "@/server/room";

export const PRESENCE_WINDOW_MS = 60_000;
export const MAX_PRESENCE_SESSIONS = 500;
// Abandoned presence keys disappear once every member has certainly expired.
const PRESENCE_TTL_MS = 2 * PRESENCE_WINDOW_MS;

export class PresenceCapacityError extends Error {
  constructor(public readonly retryAfter: number) {
    super("This room has reached its active session limit. Please try again shortly.");
    this.name = "PresenceCapacityError";
  }
}

// Pruning, the optional heartbeat upsert, and the snapshot read are one atomic
// operation on Redis server time. KEYS[1] is a sorted set of clientId scored by
// last-seen milliseconds; KEYS[2] is a hash of clientId to {displayName, connectedAt}.
// A last-seen age of ARGV[3] ms or more is expired. Every loop is bounded by the cap.
export const PRESENCE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window = tonumber(ARGV[3])
local cap = tonumber(ARGV[4])

local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now - window, 'LIMIT', 0, cap)
for index = 1, #expired, 100 do
  local last = math.min(index + 99, #expired)
  redis.call('ZREM', KEYS[1], unpack(expired, index, last))
  redis.call('HDEL', KEYS[2], unpack(expired, index, last))
end

if ARGV[1] == 'heartbeat' then
  local connectedAt = string.format('%d', now)
  if redis.call('ZSCORE', KEYS[1], ARGV[2]) then
    local previous = redis.call('HGET', KEYS[2], ARGV[2])
    if previous then connectedAt = cjson.decode(previous).connectedAt end
  elseif redis.call('ZCARD', KEYS[1]) >= cap then
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    return {'full', tostring(math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000)))}
  end
  redis.call('ZADD', KEYS[1], now, ARGV[2])
  redis.call('HSET', KEYS[2], ARGV[2], cjson.encode({displayName = ARGV[5], connectedAt = connectedAt}))
  redis.call('PEXPIRE', KEYS[1], ARGV[6])
  redis.call('PEXPIRE', KEYS[2], ARGV[6])
end

local result = {'ok', string.format('%d', now)}
local members = redis.call('ZRANGE', KEYS[1], 0, cap - 1, 'WITHSCORES')
if #members == 0 then return result end
local ids = {}
for index = 1, #members, 2 do ids[#ids + 1] = members[index] end
local metadata = redis.call('HMGET', KEYS[2], unpack(ids))
for index = 1, #ids do
  result[#result + 1] = ids[index]
  result[#result + 1] = members[index * 2]
  result[#result + 1] = metadata[index] or ''
end
return result
`;

function parseTimestamp(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,14}$/.test(value)) throw new RedisUnavailableError();
  return Number(value);
}

// Newest arrival first; equal arrivals fall back to ascending clientId.
export function compareParticipants(left: PresenceParticipant, right: PresenceParticipant): number {
  if (left.connectedAt !== right.connectedAt) return right.connectedAt - left.connectedAt;
  return left.clientId < right.clientId ? -1 : left.clientId > right.clientId ? 1 : 0;
}

function parseParticipant(clientId: unknown, lastSeen: unknown, metadata: unknown): PresenceParticipant {
  if (typeof clientId !== "string" || typeof metadata !== "string") throw new RedisUnavailableError();
  let stored: unknown;
  try {
    stored = JSON.parse(metadata);
  } catch {
    throw new RedisUnavailableError();
  }
  if (!stored || typeof stored !== "object" || typeof (stored as Record<string, unknown>).displayName !== "string") {
    throw new RedisUnavailableError();
  }
  const { displayName, connectedAt } = stored as Record<string, unknown>;
  const participant = {
    clientId,
    displayName: displayName as string,
    connectedAt: parseTimestamp(connectedAt),
    lastSeenAt: parseTimestamp(lastSeen),
  };
  if (participant.connectedAt > participant.lastSeenAt) throw new RedisUnavailableError();
  return participant;
}

function parseSnapshot(result: unknown): PresenceSnapshot {
  if (!Array.isArray(result) || result[0] !== "ok" || (result.length - 2) % 3 !== 0) throw new RedisUnavailableError();
  const observedAt = parseTimestamp(result[1]);
  const participants: PresenceParticipant[] = [];
  for (let index = 2; index < result.length; index += 3) {
    participants.push(parseParticipant(result[index], result[index + 1], result[index + 2]));
  }
  participants.sort(compareParticipants);
  return { onlineCount: participants.length, observedAt, participants };
}

async function runPresenceScript(mode: "read" | "heartbeat", identity?: ChatIdentity): Promise<PresenceSnapshot> {
  const prefix = roomKeyPrefix();
  const result = await redisCommand<unknown[]>([
    "EVAL", PRESENCE_SCRIPT, 2,
    `${prefix}:presence:seen`,
    `${prefix}:presence:meta`,
    mode, identity?.clientId ?? "", PRESENCE_WINDOW_MS, MAX_PRESENCE_SESSIONS,
    identity?.displayName ?? "", PRESENCE_TTL_MS,
  ]);
  if (Array.isArray(result) && result[0] === "full") {
    const retryAfter = Number(result[1]);
    throw new PresenceCapacityError(Number.isFinite(retryAfter) ? Math.max(1, retryAfter) : 10);
  }
  return parseSnapshot(result);
}

export function readPresence(): Promise<PresenceSnapshot> {
  return runPresenceScript("read");
}

// Records a heartbeat for the session and returns the snapshot that includes it.
export function recordPresenceHeartbeat(identity: ChatIdentity): Promise<PresenceSnapshot> {
  return runPresenceScript("heartbeat", identity);
}
