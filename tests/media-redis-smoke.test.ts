// @vitest-environment node
// Opt in with RUN_MEDIA_REDIS_SMOKE=1 npm run test:ci -- tests/media-redis-smoke.test.ts
// Runs the real Lua scripts against a disposable local Redis over a Unix socket.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appendChatMessage, readChatMessages } from "@/server/chat-store";
import { readMedia, storeMedia } from "@/server/media-store";
import { redisCommand } from "@/server/redis";

vi.mock("@/server/redis", async (original) => ({ ...await original<typeof import("@/server/redis")>(), redisCommand: vi.fn() }));
const runFile = promisify(execFile);
const suite = process.env.RUN_MEDIA_REDIS_SMOKE === "1" ? describe : describe.skip;
suite("real Redis media Lua smoke", () => {
  let server: ChildProcess;
  let directory: string;
  let socket: string;
  const clientId = "00000000-0000-4000-8000-000000000001";
  const input = { clientId, clientMessageId: "00000000-0000-4000-8000-000000000002", displayName: "Smoke", content: "caption" };
  async function command(args: readonly (string | number)[]) {
    const { stdout } = await runFile("redis-cli", ["-s", socket, "--json", ...args.map(String)], { maxBuffer: 2 * 1024 * 1024 });
    return JSON.parse(stdout);
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "teamchat-media-"));
    socket = join(directory, "redis.sock");
    server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no", "--dir", directory], { stdio: "ignore" });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if (await command(["PING"]) === "PONG") break; } catch { /* Wait for the isolated server. */ }
      await delay(20);
    }
    expect(await command(["PING"])).toBe("PONG");
    vi.mocked(redisCommand).mockImplementation(command);
    vi.stubEnv("CHAT_ROOM_PREFIX", "redis-media-smoke");
  });
  afterAll(async () => {
    if (server && server.exitCode === null) {
      const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve()));
      server.kill("SIGTERM");
      await stopped;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  it("uploads, reads, attaches, dedupes after expiry, and isolates rooms without renewing TTL", async () => {
    const media = await storeMedia(clientId, "image/png", Buffer.from("smoke bytes"));
    const key = `teamchat:{redis-media-smoke}:media:${media.id}`;
    const before = Number(await command(["PTTL", key]));
    expect(before).toBeGreaterThan(86390000);
    expect(before).toBeLessThanOrEqual(86400000);
    expect((await readMedia(media.id))?.base64).toBe(Buffer.from("smoke bytes").toString("base64"));
    const draft = { ...input, attachment: { id: media.id, alt: "Description" } };
    const accepted = await appendChatMessage(draft);
    expect(accepted.message.attachment).toEqual({ ...draft.attachment, expiresAt: media.expiresAt });
    expect(Number(await command(["PTTL", key]))).toBeLessThanOrEqual(before);
    expect((await readChatMessages()).messages[0]).toEqual(accepted.message);
    expect(JSON.stringify(await readChatMessages())).not.toContain("base64");
    await expect(appendChatMessage({ ...draft, attachment: { ...draft.attachment, alt: "Changed" } })).rejects.toThrow("already used");
    await expect(appendChatMessage({ ...draft, clientId: "other", clientMessageId: "other" })).rejects.toThrow("belongs to another");
    vi.stubEnv("CHAT_ROOM_PREFIX", "isolated-room");
    expect(await readMedia(media.id)).toBeNull();
    await expect(appendChatMessage(draft)).rejects.toThrow("unavailable");
    vi.stubEnv("CHAT_ROOM_PREFIX", "redis-media-smoke");
    // Shorten only this disposable media key to exercise actual Redis expiry.
    await command(["PEXPIRE", key, 1]);
    await delay(10);
    expect(await readMedia(media.id)).toBeNull();
    const retried = await appendChatMessage(draft);
    expect(retried.created).toBe(false);
    expect(retried.message).toEqual(accepted.message);
    await expect(appendChatMessage({ ...draft, clientMessageId: "new" })).rejects.toThrow("expired");
    const text = await appendChatMessage({ ...input, clientMessageId: "text", content: "legacy text" });
    expect(text.message).not.toHaveProperty("attachment");
  });
  it("enforces concurrent client and room limits, cleans expiry index, and leaves no rejected slots", async () => {
    vi.stubEnv("CHAT_ROOM_PREFIX", "redis-media-limits");
    const uploads = await Promise.allSettled(Array.from({ length: 8 }, () => storeMedia(clientId, "image/png", Buffer.from("x"))));
    expect(uploads.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(uploads.filter((result) => result.status === "rejected")).toHaveLength(3);
    expect(await command(["ZCARD", "teamchat:{redis-media-limits}:media-expiries"])).toBe(5);
    for (let index = 0; index < 45; index++) await storeMedia(`client-${index}`, "image/png", Buffer.from("x"));
    await expect(storeMedia("extra", "image/png", Buffer.from("x"))).rejects.toMatchObject({ retryAfter: expect.any(Number) });
    expect(await command(["ZCARD", "teamchat:{redis-media-limits}:media-expiries"])).toBe(50);
    expect(await command(["GET", "teamchat:{redis-media-limits}:media-rate:extra"])).toBeNull();
    const ids = await command(["ZRANGE", "teamchat:{redis-media-limits}:media-expiries", 0, 0]) as string[];
    // Simulate elapsed server time for one index member, without clearing room history.
    await command(["ZADD", "teamchat:{redis-media-limits}:media-expiries", 0, ids[0]]);
    await command(["DEL", `teamchat:{redis-media-limits}:media:${ids[0]}`]);
    await storeMedia("extra", "image/png", Buffer.from("x"));
    expect(await command(["ZCARD", "teamchat:{redis-media-limits}:media-expiries"])).toBe(50);
    expect((await command(["KEYS", "teamchat:{redis-media-limits}:media:*"]) as string[])).toHaveLength(50);
    // An expired rate key permits new successful uploads; a full room still rejects.
    await command(["PEXPIRE", `teamchat:{redis-media-limits}:media-rate:${clientId}`, 1]);
    await delay(10);
    await expect(storeMedia(clientId, "image/png", Buffer.from("x"))).rejects.toThrow("limit");
  });
});
