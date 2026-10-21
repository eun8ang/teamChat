import { NextResponse } from "next/server";
import { MAX_DISPLAY_NAME_LENGTH } from "@/config/chat";

export const NO_CACHE = { "Cache-Control": "no-store" };

export class OversizedBodyError extends Error {}

export function errorResponse(error: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { ...NO_CACHE, ...headers } });
}

export function requestHasForeignOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (origin === null) return false;

  // Next.js can rewrite request.url to its internal localhost address. Host is
  // the browser's actual destination and cannot be set by browser JavaScript.
  // Do not accept x-forwarded-host as a replacement for that destination.
  try {
    const expected = new URL(request.url);
    const host = request.headers.get("host");
    if (host) {
      const external = new URL(`${expected.protocol}//${host}`);
      if (external.username || external.password || external.pathname !== "/" || external.search || external.hash) {
        return true;
      }
      expected.host = external.host;
    }
    return origin !== expected.origin;
  } catch {
    return true;
  }
}

export function hasJsonContentType(request: Request): boolean {
  return request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json";
}

// Returns the trimmed name, or null for a missing, empty, too long, or control-character name.
export function parseDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const displayName = value.trim();
  if (displayName.length < 1 || displayName.length > MAX_DISPLAY_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(displayName)) {
    return null;
  }
  return displayName;
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new OversizedBodyError();
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new OversizedBodyError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
