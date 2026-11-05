"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isImageMimeType, MAX_IMAGE_ALT_LENGTH, MAX_IMAGE_BYTES } from "@/lib/media";
import type { ImageDraft } from "@/types/chat";

export function ImageAttachmentPicker({ value, onChange, disabled, isUploading = false }: {
  value: ImageDraft | null; onChange: (value: ImageDraft | null) => void; disabled: boolean; isUploading?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLImageElement>(null);
  const [error, setError] = useState("");
  const file = value?.file;
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (preview.current) preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <details className="image-picker" open={Boolean(value)}>
    <summary>Attach an image</summary>
    <fieldset disabled={disabled}>
    <legend className="sr-only">Image attachment</legend>
    <p id={`${id}-help`}>One PNG, JPEG, or WebP, up to 100 KiB (102,400 bytes). Images expire 24 hours after upload. A caption and image description are required.</p>
    <label htmlFor={`${id}-file`}>Choose image</label>
    <input ref={input} id={`${id}-file`} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`${id}-help`} onChange={(event) => {
      const files = event.target.files;
      if (!files?.length) return;
      if (files.length !== 1 || !isImageMimeType(files[0].type) || files[0].size === 0 || files[0].size > MAX_IMAGE_BYTES) {
        setError("Select one PNG, JPEG, or WebP image up to 100 KiB (102,400 bytes).");
        event.target.value = "";
        return;
      }
      setError("");
      onChange({ file: files[0], alt: "" });
      event.target.value = "";
    }} />
    {value && <div className="image-draft">
      {/* Local object URLs and the media route provide bounded raster images. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={preview} alt="Selected image preview" className="attachment-preview" />
      <span>{value.file.name} ({value.file.size.toLocaleString("en-US")} bytes)</span>
      <label htmlFor={`${id}-alt`}>Image description</label>
      <input id={`${id}-alt`} value={value.alt} maxLength={MAX_IMAGE_ALT_LENGTH} required onChange={(event) => onChange({ ...value, alt: event.target.value })} />
      <button type="button" onClick={() => { onChange(null); setError(""); }}>Remove image</button>
    </div>}
    {isUploading && <p role="status">Uploading image…</p>}
    {error && <p role="alert">{error}</p>}
    </fieldset>
  </details>;
}
