// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PRESENCE_SESSIONS, PRESENCE_WINDOW_MS, PresenceCapacityError, readPresence, recordPresenceHeartbeat } from "@/server/presence-store";
import { redisCommand, RedisUnavailableError } from "@/server/redis";

vi.mock("@/server/redis", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/redis")>(),
  redisCommand: vi.fn(),
}));

// The mocked transport does not execute Lua. These tests cover the arguments sent
// to the atomic script and the parsing/ordering of its result; smoke-test the real
// script against a development Redis in an isolated CHAT_ROOM_PREFIX.
const command = vi.mocked(redisCommand);
const alice = { clientId: "00000000-0000-4000-8000-00000000000a", displayName: "Alice" };
const bob = { clientId: "00000000-0000-4000-8000-00000000000b", displayName: "Bob" };
const meta = (displayName: string, connectedAt: number) => JSON.stringify({ displayName, connectedAt: String(connectedAt) });

describe("presence store", () => {
  beforeEach(() => {
    vi.stubEnv("CHAT_ROOM_PREFIX", "unit-test-room");
    command.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("sends one atomic heartbeat with server-side bounds under the room hash slot", async () => {
    command.mockResolvedValue(["ok", "1700000060000", alice.clientId, "1700000060000", meta("Alice", 1700000060000)]);
    const snapshot = await recordPresenceHeartbeat(alice);
    const args = command.mock.calls[0][0];
    expect(args[0]).toBe("EVAL");
    expect(args.slice(2)).toEqual([
      2, "teamchat:{unit-test-room}:presence:seen", "teamchat:{unit-test-room}:presence:meta",
      "heartbeat", alice.clientId, PRESENCE_WINDOW_MS, MAX_PRESENCE_SESSIONS, "Alice", 2 * PRESENCE_WINDOW_MS,
    ]);
    expect(snapshot).toEqual({
      onlineCount: 1,
      observedAt: 1700000060000,
      participants: [{ ...alice, connectedAt: 1700000060000, lastSeenAt: 1700000060000 }],
    });
  });

  it("reads without a heartbeat and isolates rooms by prefix", async () => {
    command.mockResolvedValue(["ok", "1700000000000"]);
    expect(await readPresence()).toEqual({ onlineCount: 0, observedAt: 1700000000000, participants: [] });
    expect(command.mock.calls[0][0].slice(3, 7)).toEqual([
      "teamchat:{unit-test-room}:presence:seen", "teamchat:{unit-test-room}:presence:meta", "read", "",
    ]);
    vi.stubEnv("CHAT_ROOM_PREFIX", "other-room");
    await readPresence();
    expect(command.mock.calls[1][0][3]).toBe("teamchat:{other-room}:presence:seen");
  });

  it("orders newest arrivals first, keeps heartbeat order stable, and breaks ties by clientId", async () => {
    const carol = { clientId: "00000000-0000-4000-8000-000000000009", displayName: "Alice" };
    // Alice's newer heartbeat (lastSeen) must not move her above Bob, who arrived later.
    command.mockResolvedValue([
      "ok", "1700000050000",
      alice.clientId, "1700000049000", meta("Alice", 1700000000000),
      bob.clientId, "1700000040000", meta("Bob", 1700000010000),
      carol.clientId, "1700000045000", meta("Alice", 1700000010000),
    ]);
    const { participants, onlineCount } = await readPresence();
    expect(onlineCount).toBe(3);
    expect(participants.map((participant) => participant.clientId)).toEqual([carol.clientId, bob.clientId, alice.clientId]);
  });

  it("reports the capacity limit with a retry hint instead of dropping members", async () => {
    command.mockResolvedValue(["full", "17"]);
    await expect(recordPresenceHeartbeat(bob)).rejects.toMatchObject<Partial<PresenceCapacityError>>({ retryAfter: 17 });
  });

  it.each([
    [null],
    [["ok"]],
    [["ok", "1700000000000", alice.clientId, "1700000000000"]],
    [["ok", "1700000000000", alice.clientId, "1700000000000", ""]],
    [["ok", "1700000000000", alice.clientId, "1700000000000", "{bad json"]],
    [["ok", "1700000000000", alice.clientId, "1.7e12", meta("Alice", 1700000000000)]],
    [["ok", "1700000000000", alice.clientId, "1700000000000", meta("Alice", 1700000000001)]],
    [["unexpected"]],
  ])("fails closed on an invalid storage response %#", async (result) => {
    command.mockResolvedValue(result);
    await expect(readPresence()).rejects.toBeInstanceOf(RedisUnavailableError);
  });
});
