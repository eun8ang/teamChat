import { MEDIA_ID_PATTERN } from "@/lib/media";
import { errorResponse, NO_CACHE, requestHasForeignOrigin } from "@/server/http";
import { readMedia } from "@/server/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (requestHasForeignOrigin(request)) return errorResponse("Use this chat from its own website.", 403);
  const { id } = await params;
  if (!MEDIA_ID_PATTERN.test(id)) return errorResponse("Image not found.", 404);
  try {
    const media = await readMedia(id);
    if (!media) return errorResponse("Image not found.", 404);
    return new Response(new Uint8Array(Buffer.from(media.base64, "base64")), { headers: {
      ...NO_CACHE, "Content-Type": media.mimeType, "Content-Length": String(media.byteLength), "X-Content-Type-Options": "nosniff",
    } });
  } catch { return errorResponse("Image storage is temporarily unavailable. Please try again shortly.", 503); }
}
