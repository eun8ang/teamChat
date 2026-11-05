import { NextResponse } from "next/server";
import { isValidClientId } from "@/lib/message";
import { isImageMimeType, MAX_IMAGE_BYTES } from "@/lib/media";
import { errorResponse, NO_CACHE, OversizedBodyError, requestHasForeignOrigin } from "@/server/http";
import { hasValidImageStructure } from "@/server/media-validation";
import { MediaRateLimitError, storeMedia } from "@/server/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 150 * 1024;
async function readMultipart(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new OversizedBodyError();
  if (!request.body) throw new Error();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new OversizedBodyError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  // Parse only after the entire request has passed the streaming byte bound.
  return new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
}
export async function POST(request: Request) {
  if (requestHasForeignOrigin(request)) return errorResponse("Use this chat from its own website.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "multipart/form-data") return errorResponse("Send an image as multipart/form-data.", 415);
  let form: FormData;
  try { form = await readMultipart(request); }
  catch (error) { return errorResponse(error instanceof OversizedBodyError ? "Image request is too large." : "Invalid image upload.", error instanceof OversizedBodyError ? 413 : 400); }
  const file = form.get("file");
  const clientId = form.get("clientId");
  if (form.getAll("file").length !== 1 || form.getAll("clientId").length !== 1 || [...form.keys()].some((key) => key !== "file" && key !== "clientId") ||
    !file || typeof file === "string" || typeof clientId !== "string" || !isValidClientId(clientId)) return errorResponse("Select one image and use a valid client ID.", 400);
  if (file.size > MAX_IMAGE_BYTES) return errorResponse("Images must be at most 100 KiB (102,400 bytes).", 413);
  if (!isImageMimeType(file.type)) return errorResponse("Use a PNG, JPEG, or WebP image.", 415);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length !== file.size || !hasValidImageStructure(bytes, file.type)) return errorResponse("The image is incomplete or does not match its declared format.", 400);
  try {
    return NextResponse.json(await storeMedia(clientId.toLowerCase(), file.type, bytes), { status: 201, headers: NO_CACHE });
  } catch (error) {
    if (error instanceof MediaRateLimitError) return errorResponse(error.message, 429, { "Retry-After": String(error.retryAfter) });
    return errorResponse("Image storage is temporarily unavailable. Please try again shortly.", 503);
  }
}
