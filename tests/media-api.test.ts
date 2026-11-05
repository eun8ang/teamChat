// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/media/route";
import { GET } from "@/app/api/media/[id]/route";
import { MediaRateLimitError, readMedia, storeMedia } from "@/server/media-store";
import { hasValidImageStructure } from "@/server/media-validation";

vi.mock("@/server/media-store", async (original) => ({ ...await original<typeof import("@/server/media-store")>(), readMedia: vi.fn(), storeMedia: vi.fn() }));
const clientId = "00000000-0000-4000-8000-000000000001";
const id = "a".repeat(32);
// A complete one-pixel PNG, including chunk checksums and zlib data.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const metadata = { id, mimeType: "image/png" as const, byteLength: png.length, expiresAt: 1800000000000 };
function upload(bytes: BlobPart = new Uint8Array(png), mime = "image/png", headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([bytes], "untrusted.svg", { type: mime }));
  form.set("clientId", clientId);
  return new Request("https://chat.invalid/api/media", { method: "POST", body: form, headers });
}
beforeEach(() => { vi.mocked(storeMedia).mockReset().mockResolvedValue(metadata); vi.mocked(readMedia).mockReset(); });
describe("bounded media API", () => {
  it("accepts valid image bytes regardless of filename, returns metadata only", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(metadata);
    expect(storeMedia).toHaveBeenCalledWith(clientId, "image/png", png);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["image/svg+xml", "image/gif", "application/octet-stream"])("rejects unsupported MIME %s", async (mime) => {
    expect((await POST(upload(new Uint8Array(png), mime))).status).toBe(415);
    expect(storeMedia).not.toHaveBeenCalled();
  });
  it("rejects MIME mismatches, corrupted/truncated PNGs and oversized images", async () => {
    for (const bytes of [png.subarray(0, -1), Buffer.from("not an image"), Buffer.from(png).fill(0, 35, 40)]) {
      expect((await POST(upload(new Uint8Array(bytes)))).status).toBe(400);
    }
    expect((await POST(upload(new Uint8Array(png), "image/jpeg"))).status).toBe(400);
    expect((await POST(upload(new Uint8Array(102401)))).status).toBe(413);
    expect(storeMedia).not.toHaveBeenCalled();
  });
  it("bounds streamed input without Content-Length before multipart parsing", async () => {
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(80 * 1024)); }, cancel() { cancelled = true; } });
    const request = new Request("https://chat.invalid/api/media", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(request)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(storeMedia).not.toHaveBeenCalled();
  });
  it("rejects empty/multiple files, bad client IDs and malformed multipart", async () => {
    const form = new FormData();
    form.set("clientId", clientId);
    expect((await POST(new Request("https://chat.invalid/api/media", { method: "POST", body: form }))).status).toBe(400);
    form.append("file", new File([png], "a.png", { type: "image/png" }));
    form.append("file", new File([png], "b.png", { type: "image/png" }));
    expect((await POST(new Request("https://chat.invalid/api/media", { method: "POST", body: form }))).status).toBe(400);
    form.delete("file"); form.set("clientId", "bad");
    form.set("file", new File([png], "a.png", { type: "image/png" }));
    expect((await POST(new Request("https://chat.invalid/api/media", { method: "POST", body: form }))).status).toBe(400);
    expect((await POST(new Request("https://chat.invalid/api/media", { method: "POST", body: "broken", headers: { "Content-Type": "multipart/form-data" } }))).status).toBe(400);
    expect(storeMedia).not.toHaveBeenCalled();
  });
  it("mirrors Host-based same-origin checks and ignores spoofed forwarding", async () => {
    const form = await upload().formData();
    const request = (origin: string) => new Request("http://localhost:3000/api/media", { method: "POST", body: form, headers: { Host: "127.0.0.1:3000", Origin: origin, "X-Forwarded-Host": "foreign.invalid" } });
    expect((await POST(request("http://127.0.0.1:3000"))).status).toBe(201);
    expect((await POST(request("http://foreign.invalid"))).status).toBe(403);
    expect((await POST(upload(undefined, undefined, { "Sec-Fetch-Site": "cross-site" }))).status).toBe(403);
  });
  it("returns safe 429/503 responses", async () => {
    vi.mocked(storeMedia).mockRejectedValueOnce(new MediaRateLimitError(42));
    const limited = await POST(upload());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
    vi.mocked(storeMedia).mockRejectedValueOnce(new Error("private token"));
    const failed = await POST(upload());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private token");
  });
  it("serves binary bytes with trusted MIME and safe headers, or 404/503", async () => {
    const request = new Request(`https://chat.invalid/api/media/${id}`);
    vi.mocked(readMedia).mockResolvedValueOnce({ ...metadata, clientId, base64: png.toString("base64") });
    const response = await GET(request, { params: Promise.resolve({ id }) });
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    vi.mocked(readMedia).mockResolvedValueOnce(null);
    expect((await GET(request, { params: Promise.resolve({ id }) })).status).toBe(404);
    expect((await GET(request, { params: Promise.resolve({ id: "../secret" }) })).status).toBe(404);
    vi.mocked(readMedia).mockRejectedValueOnce(new Error("private"));
    expect((await GET(request, { params: Promise.resolve({ id }) })).status).toBe(503);
  });
});
describe("raster structure", () => {
  it("requires complete PNG chunks with CRCs and compressed data", () => {
    expect(hasValidImageStructure(png, "image/png")).toBe(true);
    for (let length = 0; length < png.length; length++) expect(hasValidImageStructure(png.subarray(0, length), "image/png")).toBe(false);
  });
  it("rejects header-only and truncated JPEG/WebP payloads", () => {
    for (const mime of ["image/jpeg", "image/webp"] as const) {
      for (const bytes of [Buffer.from([0xff, 0xd8, 0xff, 0xd9]), Buffer.from("RIFF\x10\0\0\0WEBPVP8 "), png]) expect(hasValidImageStructure(bytes, mime)).toBe(false);
    }
  });
});

it("accepts complete JPEG and WebP images and rejects their truncated forms", () => {
  const examples = [
    ["image/jpeg", "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIYBmIv/2Q=="],
    ["image/webp", "UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+645f/OJY6nd0H//MEr8g3KgAAA=="],
  ] as const;
  for (const [mime, base64] of examples) {
    const bytes = Buffer.from(base64, "base64");
    expect(hasValidImageStructure(bytes, mime)).toBe(true);
    for (let length = 0; length < bytes.length; length++) expect(hasValidImageStructure(bytes.subarray(0, length), mime)).toBe(false);
  }
});

it("accepts bounded animated WebP frames and rejects truncated or out-of-canvas frames", () => {
  const still = Buffer.from("UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+645f/OJY6nd0H//MEr8g3KgAAA==", "base64");
  const chunk = (type: string, data: Buffer) => {
    const result = Buffer.alloc(8 + data.length + data.length % 2);
    result.write(type); result.writeUInt32LE(data.length, 4); data.copy(result, 8);
    return result;
  };
  const extended = Buffer.alloc(10); extended[0] = 2; extended.writeUIntLE(1, 4, 3); extended.writeUIntLE(1, 7, 3);
  const frameHeader = Buffer.alloc(16); frameHeader.writeUIntLE(1, 6, 3); frameHeader.writeUIntLE(1, 9, 3); frameHeader.writeUIntLE(100, 12, 3);
  const frame = chunk("ANMF", Buffer.concat([frameHeader, still.subarray(12)]));
  const payload = Buffer.concat([chunk("VP8X", extended), chunk("ANIM", Buffer.alloc(6)), frame, frame]);
  const animated = Buffer.alloc(12 + payload.length);
  animated.write("RIFF"); animated.writeUInt32LE(animated.length - 8, 4); animated.write("WEBP", 8); payload.copy(animated, 12);
  expect(hasValidImageStructure(animated, "image/webp")).toBe(true);
  expect(hasValidImageStructure(animated.subarray(0, -1), "image/webp")).toBe(false);
  // The first frame's x offset would move it beyond the declared canvas.
  animated[12 + 18 + 14 + 8] = 1;
  expect(hasValidImageStructure(animated, "image/webp")).toBe(false);
});
