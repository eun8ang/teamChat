import { RedisUnavailableError } from "@/server/redis";

export function roomKeyPrefix(): string {
  const room = process.env.CHAT_ROOM_PREFIX || process.env.VERCEL_ENV || "development";
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(room)) throw new RedisUnavailableError();
  // All EVAL keys share one Redis Cluster hash slot, even across clients.
  return `teamchat:{${room}}`;
}
