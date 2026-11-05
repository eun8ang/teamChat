// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendChatMessage, ChatRateLimitError, isValidCursor, MessageConflictError, readChatMessages } from "@/server/chat-store";
import { redisCommand } from "@/server/redis";

vi.mock("@/server/redis", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/redis")>(),
  redisCommand: vi.fn(),
}));

const command = vi.mocked(redisCommand);
const input = {
  clientId: "f49e495a-e0cf-4bf4-bdef-0f5ed4fbe94d",
  clientMessageId: "608dc459-3520-4f3f-8cee-b8c5ff31bfe1",
  displayName: "Workshop member",
  content: "Hello, everyone!",
};

function streamEntry(id: string, content: string) {
  return [id, ["clientId", input.clientId, "displayName", input.displayName, "content", content, "createdAt", "2026-10-20T12:00:00.000Z"]];
}

describe("shared chat store", () => {
  beforeEach(() => {
    vi.stubEnv("CHAT_ROOM_PREFIX", "unit-test-room");
    command.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("returns the latest bounded history in chronological order and fetches exclusively after a cursor", async () => {
    command.mockResolvedValueOnce([streamEntry("102-0", "second"), streamEntry("101-0", "first")]);
    const initial = await readChatMessages();
    expect(initial.messages.map((message) => message.content)).toEqual(["first", "second"]);
    expect(initial.cursor).toBe("102-0");
    expect(command).toHaveBeenLastCalledWith(["XREVRANGE", "teamchat:{unit-test-room}:messages", "+", "-", "COUNT", 100]);

    command.mockResolvedValueOnce([]);
    expect(await readChatMessages(initial.cursor)).toEqual({ messages: [], cursor: "102-0" });
    expect(command).toHaveBeenLastCalledWith(["XRANGE", "teamchat:{unit-test-room}:messages", "(102-0", "+", "COUNT", 100]);
  });

  it("uses environment-separated rooms and rejects invalid cursor IDs", async () => {
    vi.stubEnv("CHAT_ROOM_PREFIX", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    command.mockResolvedValue([]);
    expect(await readChatMessages()).toEqual({ messages: [], cursor: "0-0" });
    expect(command.mock.calls[0][0][1]).toBe("teamchat:{preview}:messages");
    expect(isValidCursor("18446744073709551615-0")).toBe(true);
    for (const cursor of ["18446744073709551616-0", "-", "(1-0", "1-0 COUNT 500", "01-0"]) {
      expect(isValidCursor(cursor)).toBe(false);
    }
  });

  it("gives concurrent retried writes the same atomic dedupe key and original message ID", async () => {
    // This fake models the atomic Redis boundary; a real Redis smoke test also
    // exercises the Lua implementation when deployment credentials are ready.
    const stored = new Map<string, { fingerprint: string; message: Record<string, string> }>();
    command.mockImplementation(async (args) => {
      expect(args[0]).toBe("EVAL");
      expect(args[2]).toBe(4);
      const dedupeKey = String(args[4]);
      const fingerprint = String(args[11]);
      const previous = stored.get(dedupeKey);
      if (previous) return previous.fingerprint === fingerprint
        ? ["duplicate", JSON.stringify(previous.message)]
        : ["conflict"];
      const message = { id: "1700000000000-0", clientId: String(args[7]), displayName: String(args[8]), content: String(args[9]), createdAt: String(args[10]) };
      stored.set(dedupeKey, { fingerprint, message });
      return ["created", JSON.stringify(message)];
    });

    const results = await Promise.all([
      appendChatMessage(input, "203.0.113.10"),
      appendChatMessage(input, "203.0.113.10"),
    ]);
    expect(results.map((result) => result.created)).toEqual([true, false]);
    expect(results[0].message).toEqual(results[1].message);
    expect(stored.size).toBe(1);
    expect(command.mock.calls[0][0][6]).not.toContain("203.0.113.10");
    await expect(appendChatMessage({ ...input, content: "Different content" })).rejects.toBeInstanceOf(MessageConflictError);
  });

  it("surfaces the atomic rate limit without publishing a message", async () => {
    command.mockResolvedValue(["rate_limited", "7"]);
    await expect(appendChatMessage(input)).rejects.toMatchObject<Partial<ChatRateLimitError>>({ retryAfter: 7 });
    const args = command.mock.calls[0][0];
    expect(args.slice(-5)).toEqual([10_000, 5, 100, 500, 86_400]);
  });
});

it("round trips attachment metadata while preserving legacy text entries", async () => {
  const attachment = { id: "a".repeat(32), alt: "Workshop image", expiresAt: 1800000000000 };
  const entry = streamEntry("101-0", "caption");
  (entry[1] as string[]).push("attachment", JSON.stringify(attachment));
  command.mockResolvedValueOnce([entry, streamEntry("100-0", "legacy")]);
  const page = await readChatMessages();
  expect(page.messages[0]).not.toHaveProperty("attachment");
  expect(page.messages[1].attachment).toEqual(attachment);
  expect(JSON.stringify(page)).not.toContain("base64");
});

it("includes attachment ID and description in fingerprints and passes only metadata", async () => {
  const attachment = { id: "a".repeat(32), alt: "Workshop image" };
  command.mockResolvedValue(["conflict"]);
  for (const next of [attachment, { ...attachment, alt: "Changed" }, { ...attachment, id: "b".repeat(32) }]) {
    await expect(appendChatMessage({ ...input, attachment: next })).rejects.toBeInstanceOf(MessageConflictError);
  }
  const calls = command.mock.calls.slice(-3).map(([args]) => args);
  expect(calls.every((args) => args[2] === 5)).toBe(true);
  expect(new Set(calls.map((args) => args[12])).size).toBe(3);
  expect(calls[0].slice(-2)).toEqual([attachment.id, attachment.alt]);
  command.mockResolvedValueOnce(["invalid_attachment"]);
  await expect(appendChatMessage({ ...input, attachment })).rejects.toThrow("unavailable, expired");
});
