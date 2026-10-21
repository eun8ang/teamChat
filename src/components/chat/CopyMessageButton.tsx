"use client";

import { useEffect, useRef, useState } from "react";

const FEEDBACK_RESET_MS = 2500;
const COPY_FAILURE_TEXT = "Could not copy. Select the message text and copy it manually.";

type CopyStatus = "idle" | "copied" | "failed";

interface CopyMessageButtonProps {
  content: string;
  messageLabel: string;
}

export function CopyMessageButton({ content, messageLabel }: CopyMessageButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const mounted = useRef(true);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAttempt = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  function settle(attempt: number, next: CopyStatus) {
    // A newer activation owns the feedback, so a slow earlier write stays silent.
    if (!mounted.current || attempt !== latestAttempt.current) return;
    setStatus(next);
    resetTimer.current = setTimeout(() => {
      if (mounted.current && attempt === latestAttempt.current) setStatus("idle");
    }, FEEDBACK_RESET_MS);
  }

  async function copyMessage() {
    const attempt = (latestAttempt.current += 1);
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    resetTimer.current = null;
    setStatus("idle");
    try {
      // Reached before any await so the browser still sees the participant’s activation.
      await navigator.clipboard.writeText(content);
      settle(attempt, "copied");
    } catch {
      // A missing API, a page without clipboard access, and a rejected write all end here.
      settle(attempt, "failed");
    }
  }

  return (
    <span className="message-copy">
      <button
        type="button"
        className="copy-button"
        onClick={() => { void copyMessage(); }}
        aria-label={`Copy ${messageLabel}`}
        title="Copy message text"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M15.5 5.5A2.5 2.5 0 0 0 13 3H5.5A2.5 2.5 0 0 0 3 5.5V13a2.5 2.5 0 0 0 2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <span className={`copy-feedback copy-feedback-${status}`} role="status">
        {status === "copied" ? "Copied" : status === "failed" ? COPY_FAILURE_TEXT : ""}
      </span>
    </span>
  );
}
