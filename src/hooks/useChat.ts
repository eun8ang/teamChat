"use client";

import { parseAttachment, isImageMimeType, MAX_IMAGE_BYTES } from "@/lib/media";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_CLIENT_MESSAGES, MESSAGE_POLL_INTERVAL_MS, MESSAGE_REQUEST_TIMEOUT_MS } from "@/config/chat";
import { isValidMessage, normalizeMessage } from "@/lib/message";
import type { ChatIdentity, ChatMessage, ImageDraft, ConnectionStatus, MessagesResponse, SendMessageResponse } from "@/types/chat";

function compareCursors(left: string, right: string): number {
  const [leftTime, leftSequence] = left.split("-").map(BigInt);
  const [rightTime, rightSequence] = right.split("-").map(BigInt);
  if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
  return leftSequence === rightSequence ? 0 : leftSequence < rightSequence ? -1 : 1;
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const unique = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => unique.set(message.id, message));
  return [...unique.values()].sort((left, right) => compareCursors(left.id, right.id)).slice(-MAX_CLIENT_MESSAGES);
}

async function responseError(response: Response): Promise<string> {
  let message = "Couldn’t send your message. Please try again.";
  try {
    const data = await response.json();
    if (typeof data.error === "string") message = data.error;
  } catch { /* Keep the useful fallback if the response is not JSON. */ }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (retryAfter > 0) message += ` Try again in ${retryAfter} seconds.`;
  }
  return message;
}

export function useChat(identity: ChatIdentity | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const cursor = useRef<string | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const postController = useRef<AbortController | null>(null);
  const postTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSubmission = useRef<{ content: string; clientId: string; displayName: string; messageId: string; file?: File; alt?: string; upload?: { id: string; expiresAt: number } } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      postController.current?.abort();
      if (postTimeout.current !== null) clearTimeout(postTimeout.current);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    let requestTimeout: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      const requestController = controller;
      let timedOut = false;
      requestTimeout = setTimeout(() => { timedOut = true; requestController.abort(); }, MESSAGE_REQUEST_TIMEOUT_MS);
      const after = cursor.current;
      try {
        const response = await fetch(`/api/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(await responseError(response));
        const data = await response.json() as MessagesResponse;
        if (stopped) return;
        if (!Array.isArray(data.messages) || !/^\d+-\d+$/.test(data.cursor)) throw new Error("The room returned an invalid response.");
        setMessages((current) => mergeMessages(current, data.messages));
        if (cursor.current === null || compareCursors(data.cursor, cursor.current) > 0) cursor.current = data.cursor;
        setConnectionStatus("connected");
        setConnectionError(null);
      } catch (error) {
        if (stopped || (!timedOut && error instanceof Error && error.name === "AbortError")) return;
        setConnectionStatus("reconnecting");
        setConnectionError(timedOut ? "The room took too long to respond. Reconnecting…" : error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Connection interrupted. We’re reconnecting to the room.");
      } finally {
        if (requestTimeout !== null) clearTimeout(requestTimeout);
        inFlight = false;
      }
    }

    void poll();
    const interval = setInterval(() => { void poll(); }, MESSAGE_POLL_INTERVAL_MS);
    function handleVisibility() { if (document.visibilityState === "visible") void poll(); }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      clearInterval(interval);
      controller?.abort();
      if (requestTimeout !== null) clearTimeout(requestTimeout);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [retryToken]);

  const sendMessage = useCallback(async (content: string, image?: ImageDraft): Promise<boolean> => {
    if (!identity || !isValidMessage(content) || sending.current) return false;
    const normalized = normalizeMessage(content);
    const alt = image?.alt.trim();
    if (image && (!alt || alt.length > 160 || /[\u0000-\u001f\u007f]/.test(alt) || !isImageMimeType(image.file.type) || !image.file.size || image.file.size > MAX_IMAGE_BYTES)) return false;
    const pending = pendingSubmission.current;
    const submission = pending?.content === normalized && pending.clientId === identity.clientId && pending.displayName === identity.displayName && pending.file === image?.file && pending.alt === alt
      ? pending : { content: normalized, clientId: identity.clientId, displayName: identity.displayName, messageId: crypto.randomUUID(), file: image?.file, alt, upload: undefined as { id: string; expiresAt: number } | undefined };
    pendingSubmission.current = submission;
    sending.current = true;
    setIsSending(true);
    setSendError(null);
    const controller = new AbortController();
    postController.current = controller;
    let timedOut = false;
    postTimeout.current = setTimeout(() => { timedOut = true; controller.abort(); }, MESSAGE_REQUEST_TIMEOUT_MS);

    try {
      if (image && !submission.upload) {
        setIsUploading(true);
        const form = new FormData();
        form.set("file", image.file);
        form.set("clientId", identity.clientId);
        const uploadResponse = await fetch("/api/media", { method: "POST", body: form, signal: controller.signal });
        if (!uploadResponse.ok) throw new Error(await responseError(uploadResponse));
        const upload = await uploadResponse.json();
        if (!parseAttachment({ id: upload.id, alt }) || !Number.isSafeInteger(upload.expiresAt)) throw new Error("The image upload returned an invalid response.");
        submission.upload = { id: upload.id, expiresAt: upload.expiresAt };
        if (mounted.current) setIsUploading(false);
        // Give the message request its own timeout after a successful upload.
        if (postTimeout.current !== null) clearTimeout(postTimeout.current);
        postTimeout.current = setTimeout(() => { timedOut = true; controller.abort(); }, MESSAGE_REQUEST_TIMEOUT_MS);
      }
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...identity, content: normalized, clientMessageId: submission.messageId, ...(submission.upload ? { attachment: { id: submission.upload.id, alt } } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json() as SendMessageResponse;
      if (!mounted.current) return false;
      setMessages((current) => mergeMessages(current, [data.message]));
      // Only GET advances the cursor: POST must not skip other participants’ messages.
      pendingSubmission.current = null;
      return true;
    } catch (error) {
      if (mounted.current && (timedOut || !(error instanceof Error && error.name === "AbortError"))) {
        setSendError(timedOut ? "Sending took too long. Your draft is safe; try again." : error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Couldn’t send your message. Your draft is safe; try again.");
      }
      return false;
    } finally {
      sending.current = false;
      if (postTimeout.current !== null) clearTimeout(postTimeout.current);
      postTimeout.current = null;
      if (mounted.current) { setIsSending(false); setIsUploading(false); }
    }
  }, [identity]);

  const retry = useCallback(() => { setRetryToken((current) => current + 1); }, []);
  return { messages, connectionStatus, isSending, isUploading, error: sendError ?? connectionError, sendMessage, retry };
}
