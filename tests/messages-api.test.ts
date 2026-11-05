// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/messages/route";
import { appendChatMessage, ChatRateLimitError, MessageConflictError, readChatMessages } from "@/server/chat-store";

vi.mock("@/server/chat-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/chat-store")>(),
  appendChatMessage: vi.fn(),
  readChatMessages: vi.fn(),
}));

const append = vi.mocked(appendChatMessage);
const read = vi.mocked(readChatMessages);
const body = {
  clientId: "f49e495a-e0cf-4bf4-bdef-0f5ed4fbe94d",
  clientMessageId: "608dc459-3520-4f3f-8cee-b8c5ff31bfe1",
  displayName: "Jin",
  content: "Hello!",
};
const message = { id: "1700000000000-0", clientId: body.clientId, displayName: body.displayName, content: body.content, createdAt: "2026-10-20T12:00:00.000Z" };

function post(value: unknown = body, headers: Record<string, string> = {}) {
  return new Request("https://chat.example.invalid/api/messages", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value),
  });
}

describe("shared messages API", () => {
  beforeEach(() => { append.mockReset(); read.mockReset(); });

  it("normalizes a valid message, returns 201 once, and returns 200 on an idempotent retry", async () => {
    append.mockResolvedValueOnce({ message, cursor: message.id, created: true });
    append.mockResolvedValueOnce({ message, cursor: message.id, created: false });
    const first = await POST(post({ ...body, displayName: " Jin ", content: " Hello! " }));
    expect(first.status).toBe(201);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toEqual({ message, cursor: message.id });
    expect(append).toHaveBeenLastCalledWith(body, undefined);
    expect((await POST(post())).status).toBe(200);
  });

  it.each([
    { ...body, content: " \n\t " },
    { ...body, content: "a".repeat(1_001) },
    { ...body, displayName: "a".repeat(25) },
    { ...body, clientId: "other-user" },
    { ...body, clientMessageId: "not-a-uuid" },
  ])("rejects malformed input before accessing storage", async (input) => {
    expect((await POST(post(input))).status).toBe(400);
    expect(append).not.toHaveBeenCalled();
  });

  it("bounds bodies even without Content-Length and rejects cross-origin or non-JSON writes", async () => {
    expect((await POST(post({ ...body, content: "a".repeat(20_000) }))).status).toBe(413);
    expect((await POST(post(body, { Origin: "https://another.example.invalid" }))).status).toBe(403);
    expect((await POST(post(body, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect(append).not.toHaveBeenCalled();
  });

  it("uses the browser Host when Next.js rewrites the internal request URL", async () => {
    append.mockResolvedValue({ message, cursor: message.id, created: true });
    const localRequest = new Request("http://localhost:3000/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "127.0.0.1:3000",
        Origin: "http://127.0.0.1:3000",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(body),
    });
    expect((await POST(localRequest)).status).toBe(201);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it("rejects a foreign Origin even if x-forwarded-host is spoofed", async () => {
    const foreignRequest = new Request("http://localhost:3000/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "127.0.0.1:3000",
        Origin: "http://another.example.invalid",
        "X-Forwarded-Host": "another.example.invalid",
      },
      body: JSON.stringify(body),
    });
    expect((await POST(foreignRequest)).status).toBe(403);
    expect((await POST(post(body, { "Sec-Fetch-Site": "cross-site" }))).status).toBe(403);
    expect(append).not.toHaveBeenCalled();
  });

  it("returns conflict, Retry-After, and safe storage-unavailable errors", async () => {
    append.mockRejectedValueOnce(new MessageConflictError());
    expect((await POST(post())).status).toBe(409);
    append.mockRejectedValueOnce(new ChatRateLimitError(4));
    const limited = await POST(post());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("4");
    append.mockRejectedValueOnce(new Error("private-upstream-token"));
    const unavailable = await POST(post());
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain("private-upstream-token");
  });

  it("validates cursors, returns bounded pages, and fails closed on unavailable storage", async () => {
    expect((await GET(new Request("https://chat.example.invalid/api/messages?after=bad"))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    read.mockResolvedValueOnce({ messages: [message], cursor: message.id });
    const page = await GET(new Request("https://chat.example.invalid/api/messages?after=0-0"));
    expect(read).toHaveBeenLastCalledWith("0-0");
    expect(await page.json()).toEqual({ messages: [message], cursor: message.id });
    read.mockRejectedValueOnce(new Error("storage failure"));
    expect((await GET(new Request("https://chat.example.invalid/api/messages"))).status).toBe(503);
  });
});

it("validates optional attachment metadata and never trusts a browser expiry", async () => {
  const attachment = { id: "a".repeat(32), alt: "A small workshop drawing" };
  for (const invalid of [null, {}, { ...attachment, id: "../key" }, { ...attachment, alt: " " }, { ...attachment, alt: "x".repeat(161) }]) {
    expect((await POST(post({ ...body, attachment: invalid }))).status).toBe(400);
  }
  append.mockResolvedValueOnce({ message, cursor: message.id, created: true });
  expect((await POST(post({ ...body, attachment: { ...attachment, expiresAt: 1 } }))).status).toBe(201);
  expect(append).toHaveBeenLastCalledWith({ ...body, attachment }, undefined);
});
