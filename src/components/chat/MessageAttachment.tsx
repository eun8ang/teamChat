"use client";

import { useState } from "react";
import type { MessageAttachment as Attachment } from "@/types/chat";

export function MessageAttachment({ attachment }: { attachment: Attachment }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="attachment-unavailable">Image expired or unavailable</p>;
  // The same-origin route serves only validated raster images with no-store.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="message-attachment" src={`/api/media/${attachment.id}`} alt={attachment.alt} loading="lazy" onError={() => setFailed(true)} />;
}
