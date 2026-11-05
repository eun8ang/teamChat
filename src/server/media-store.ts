import { randomBytes } from "node:crypto";
import { isImageMimeType, MAX_IMAGE_BYTES, MEDIA_ID_PATTERN, type ImageMimeType } from "@/lib/media";
import { redisCommand, RedisUnavailableError } from "@/server/redis";
import { roomKeyPrefix } from "@/server/room";

export interface MediaMetadata { id: string; mimeType: ImageMimeType; byteLength: number; expiresAt: number }
export interface StoredMedia extends MediaMetadata { clientId: string; base64: string }
export class MediaRateLimitError extends Error {
  constructor(public readonly retryAfter: number) { super("Image upload limit reached. Please try again later."); }
}
export class InvalidAttachmentError extends Error {
  constructor() { super("This image is unavailable, expired, or belongs to another participant. Select and upload it again."); }
}
export const STORE_MEDIA_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local count = tonumber(redis.call('GET', KEYS[3]) or '0')
if count >= 5 then return {'rate_limited', tostring(math.max(1, math.ceil(redis.call('PTTL', KEYS[3]) / 1000)))} end
if redis.call('ZCARD', KEYS[2]) >= 50 then
  local first = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return {'rate_limited', tostring(math.max(1, math.ceil((tonumber(first[2]) - now) / 1000)))}
end
local expiresAt = now + 86400000
local media = {id=ARGV[1], clientId=ARGV[2], mimeType=ARGV[3], byteLength=tonumber(ARGV[4]), base64=ARGV[5], expiresAt=expiresAt}
local saved = redis.call('SET', KEYS[1], cjson.encode(media), 'PX', 86400000, 'NX')
if not saved then return {'collision'} end
redis.call('ZADD', KEYS[2], expiresAt, ARGV[1])
redis.call('PEXPIRE', KEYS[2], 86400000)
redis.call('INCR', KEYS[3])
if count == 0 then redis.call('PEXPIRE', KEYS[3], 60000) end
return {'created', tostring(expiresAt)}
`;
// Server time and GET are read atomically; reads never extend media lifetime.
export const READ_MEDIA_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then return false end
local media = cjson.decode(value)
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if media.expiresAt <= now then return false end
return value
`;
export async function storeMedia(clientId: string, mimeType: ImageMimeType, bytes: Buffer): Promise<MediaMetadata> {
  const id = randomBytes(16).toString("hex");
  const prefix = roomKeyPrefix();
  const result = await redisCommand<unknown>(["EVAL", STORE_MEDIA_SCRIPT, 3,
    `${prefix}:media:${id}`, `${prefix}:media-expiries`, `${prefix}:media-rate:${clientId}`,
    id, clientId, mimeType, bytes.length, bytes.toString("base64")]);
  if (!Array.isArray(result)) throw new RedisUnavailableError();
  if (result[0] === "rate_limited") throw new MediaRateLimitError(Math.max(1, Number(result[1]) || 60));
  const expiresAt = Number(result[1]);
  if (result[0] !== "created" || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new RedisUnavailableError();
  return { id, mimeType, byteLength: bytes.length, expiresAt };
}
export async function readMedia(id: string): Promise<StoredMedia | null> {
  if (!MEDIA_ID_PATTERN.test(id)) return null;
  const raw = await redisCommand<unknown>(["EVAL", READ_MEDIA_SCRIPT, 1, `${roomKeyPrefix()}:media:${id}`]);
  if (raw === null || raw === false) return null;
  try {
    if (typeof raw !== "string") throw new Error();
    const media = JSON.parse(raw) as StoredMedia;
    if (media.id !== id || !isImageMimeType(media.mimeType) || typeof media.clientId !== "string" ||
      !Number.isSafeInteger(media.expiresAt) || media.expiresAt <= 0 || !Number.isInteger(media.byteLength) ||
      media.byteLength < 1 || media.byteLength > MAX_IMAGE_BYTES || typeof media.base64 !== "string" ||
      Buffer.from(media.base64, "base64").length !== media.byteLength) throw new Error();
    return media;
  } catch { throw new RedisUnavailableError(); }
}
