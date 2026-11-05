export const MAX_IMAGE_BYTES = 102_400;
export const MAX_IMAGE_ALT_LENGTH = 160;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageMimeType = typeof IMAGE_MIME_TYPES[number];
export const MEDIA_ID_PATTERN = /^[0-9a-f]{32}$/;
export function isImageMimeType(value: unknown): value is ImageMimeType {
  return IMAGE_MIME_TYPES.some((mime) => mime === value);
}
export function parseAttachment(value: unknown): { id: string; alt: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { id, alt } = value as Record<string, unknown>;
  if (typeof id !== "string" || !MEDIA_ID_PATTERN.test(id) || typeof alt !== "string") return null;
  const description = alt.trim();
  return description.length > 0 && description.length <= MAX_IMAGE_ALT_LENGTH && !/[\u0000-\u001f\u007f]/.test(description)
    ? { id, alt: description } : null;
}
