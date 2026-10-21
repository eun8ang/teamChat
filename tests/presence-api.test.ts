// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/presence/route";
import { PresenceCapacityError, readPresence, recordPresenceHeartbeat } from "@/server/presence-store";

vi.mock("@/server/presence-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/presence-store")>(),
  readPresence: vi.fn(),
  recordPresenceHeartbeat: vi.fn(),
}));

const read = vi.mocked(readPresence);
const heartbeat = vi.mocked(recordPresenceHeartbeat);
const body = { clientId: "f49e495a-e0cf-4bf4-bdef-0f5ed4fbe94d", displayName: "Jin" };
const snapshot = {
  onlineCount: 1,
  observedAt: 1700000000000,
  participants: [{ ...body, connectedAt: 1700000000000, lastSeenAt: 1700000000000 }],
};

function put(value: unknown = body, headers: Record<string, string> = {}) {
  return new Request("https://chat.example.invalid/api/presence", {
    method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value),
  });
}

describe("presence API", () => {
  beforeEach(() => { read.mockReset(); heartbeat.mockReset(); });

  it("records a normalized heartbeat and returns the count with participants, uncached", async () => {
    heartbeat.mockResolvedValue(snapshot);
    const response = await PUT(put({ clientId: body.clientId.toUpperCase(), displayName: " Jin " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(snapshot);
    expect(heartbeat).toHaveBeenCalledWith(body);
  });

  it("lets visitors read the snapshot without being counted", async () => {
    read.mockResolvedValue(snapshot);
    const response = await GET(new Request("https://chat.example.invalid/api/presence"));
    expect(await response.json()).toEqual(snapshot);
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, clientId: "not-a-uuid" },
    { ...body, displayName: "   " },
    { ...body, displayName: "a".repeat(25) },
    { ...body, displayName: "Jin\u0007" },
    { clientId: body.clientId },
    [body],
  ])("rejects malformed heartbeats before accessing storage", async (input) => {
    expect((await PUT(put(input))).status).toBe(400);
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it("bounds bodies, requires JSON, and rejects foreign origins", async () => {
    expect((await PUT(put({ ...body, padding: "a".repeat(3_000) }))).status).toBe(413);
    expect((await PUT(put(body, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await PUT(put(body, { Origin: "https://another.example.invalid" }))).status).toBe(403);
    expect((await GET(new Request("https://chat.example.invalid/api/presence", { headers: { "Sec-Fetch-Site": "cross-site" } }))).status).toBe(403);
    expect(heartbeat).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After at capacity and generic 503 errors", async () => {
    heartbeat.mockRejectedValueOnce(new PresenceCapacityError(12));
    const full = await PUT(put());
    expect(full.status).toBe(429);
    expect(full.headers.get("retry-after")).toBe("12");
    heartbeat.mockRejectedValueOnce(new Error("private-upstream-token"));
    const unavailable = await PUT(put());
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain("private-upstream-token");
    read.mockRejectedValueOnce(new Error("storage failure"));
    expect((await GET(new Request("https://chat.example.invalid/api/presence"))).status).toBe(503);
  });
});
