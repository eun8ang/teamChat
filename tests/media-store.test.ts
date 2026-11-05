// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readMedia, storeMedia, MediaRateLimitError } from "@/server/media-store";
import { redisCommand } from "@/server/redis";
vi.mock("@/server/redis", async (original) => ({ ...await original<typeof import("@/server/redis")>(), redisCommand: vi.fn() }));
const command = vi.mocked(redisCommand);
const clientId = "00000000-0000-4000-8000-000000000001";
const id = "a".repeat(32);
beforeEach(() => { command.mockReset(); vi.stubEnv("CHAT_ROOM_PREFIX", "media-unit"); });
afterEach(() => vi.unstubAllEnvs());
it("keeps bytes outside message data and scopes every upload key to one room hash slot", async () => {
  command.mockResolvedValueOnce(["created", "1800000000000"]);
  const result = await storeMedia(clientId, "image/png", Buffer.from("image"));
  expect(result).toEqual({ id: expect.stringMatching(/^[a-f0-9]{32}$/), mimeType: "image/png", byteLength: 5, expiresAt: 1800000000000 });
  const args = command.mock.calls[0][0];
  expect(args.slice(3, 6)).toEqual([`teamchat:{media-unit}:media:${result.id}`, "teamchat:{media-unit}:media-expiries", `teamchat:{media-unit}:media-rate:${clientId}`]);
  expect(args.at(-1)).toBe(Buffer.from("image").toString("base64"));
});
it("maps atomic upload rejection to a retryable limit without issuing further commands", async () => {
  command.mockResolvedValueOnce(["rate_limited", "12"]);
  await expect(storeMedia(clientId, "image/png", Buffer.from("image"))).rejects.toMatchObject<Partial<MediaRateLimitError>>({ retryAfter: 12 });
  expect(command).toHaveBeenCalledTimes(1);
});
it("validates IDs, reads the selected room only, and rejects non-allowlisted stored MIME", async () => {
  expect(await readMedia("../anything")).toBeNull();
  expect(command).not.toHaveBeenCalled();
  command.mockResolvedValue(null);
  expect(await readMedia(id)).toBeNull();
  expect(command.mock.calls[0][0].at(-1)).toBe(`teamchat:{media-unit}:media:${id}`);
  vi.stubEnv("CHAT_ROOM_PREFIX", "other-room");
  await readMedia(id);
  expect(command.mock.calls[1][0].at(-1)).toBe(`teamchat:{other-room}:media:${id}`);
  command.mockResolvedValue(JSON.stringify({ id, clientId, mimeType: "image/svg+xml", byteLength: 1, base64: "YQ==", expiresAt: 1800000000000 }));
  await expect(readMedia(id)).rejects.toThrow("temporarily unavailable");
});
