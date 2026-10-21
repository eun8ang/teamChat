"use client";

import { useEffect, useRef, useState } from "react";

export const COPY_FEEDBACK_RESET_MS = 2200;

const SUCCESS_MESSAGE = "Copied";
const FAILURE_MESSAGE = "Could not copy. Select the message text and copy it manually.";

type Feedback = "" | "success" | "error";

interface CopyMessageButtonProps {
  content: string;
  authorName: string;
}

export function CopyMessageButton({ content, authorName }: CopyMessageButtonProps) {
  const [feedback, setFeedback] = useState<Feedback>("");
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPendingReset();
    };
  }, []);

  function clearPendingReset() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleReset(attempt: number) {
    clearPendingReset();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (mountedRef.current && attemptRef.current === attempt) setFeedback("");
    }, COPY_FEEDBACK_RESET_MS);
  }

  async function handleCopy() {
    // Each activation supersedes any pending one so stale results cannot flip the feedback.
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    clearPendingReset();
    setFeedback("");

    const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    try {
      if (!writeText) throw new Error("Clipboard API unavailable");
      await writeText(content);
      if (!mountedRef.current || attemptRef.current !== attempt) return;
      setFeedback("success");
    } catch {
      if (!mountedRef.current || attemptRef.current !== attempt) return;
      setFeedback("error");
    }
    scheduleReset(attempt);
  }

  const message = feedback === "success" ? SUCCESS_MESSAGE : feedback === "error" ? FAILURE_MESSAGE : "";

  return (
    <div className={`message-copy ${feedback === "error" ? "message-copy-error" : ""}`}>
      <button
        type="button"
        className="copy-message-button"
        aria-label={`Copy message from ${authorName}`}
        onClick={handleCopy}
      >
        Copy
      </button>
      <span className="copy-message-feedback" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
