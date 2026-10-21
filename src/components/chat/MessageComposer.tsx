"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { MAX_MESSAGE_LENGTH } from "@/config/chat";
import { isValidMessage } from "@/lib/message";

interface MessageComposerProps {
  onSend: (content: string) => Promise<boolean>;
  isSending: boolean;
}

interface TextSelection {
  start: number;
  end: number;
}

export function MessageComposer({ onSend, isSending }: MessageComposerProps) {
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [emojiNotice, setEmojiNotice] = useState("");
  const isComposing = useRef(false);
  const submissionInProgress = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  // Last known textarea selection; null until the participant has focused the textarea.
  const selection = useRef<TextSelection | null>(null);
  const pendingSelection = useRef<TextSelection | null>(null);

  // Restore focus and caret after React has written the new draft into the textarea.
  useLayoutEffect(() => {
    const target = pendingSelection.current;
    if (!target || !input.current) return;
    pendingSelection.current = null;
    input.current.focus();
    input.current.setSelectionRange(target.start, target.end);
  });

  async function submit() {
    if (isComposing.current || isSending || submissionInProgress.current || !isValidMessage(draft)) return;
    submissionInProgress.current = true;
    try {
      if (await onSend(draft)) {
        setDraft("");
        input.current?.focus();
      }
    } finally {
      submissionInProgress.current = false;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // keyCode 229 also covers browsers that clear isComposing too early.
    if (isComposing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submit();
  }

  function rememberSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const { selectionStart, selectionEnd } = event.currentTarget;
    selection.current = { start: selectionStart, end: selectionEnd };
  }

  function setComposition(active: boolean) {
    isComposing.current = active;
    setComposing(active);
  }

  function insertEmoji(emoji: string) {
    if (isSending || isComposing.current) return;
    const { start, end } = selection.current ?? { start: draft.length, end: draft.length };
    const from = Math.min(start, draft.length);
    const to = Math.min(Math.max(end, from), draft.length);
    const next = draft.slice(0, from) + emoji + draft.slice(to);
    if (next.length > MAX_MESSAGE_LENGTH) {
      setEmojiNotice(`Couldn’t add the emoji: the message would exceed ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`);
      // The draft is unchanged, so restore focus and the original selection directly.
      input.current?.focus();
      input.current?.setSelectionRange(from, to);
      return;
    }
    const caret = from + emoji.length;
    setEmojiNotice("");
    setDraft(next);
    selection.current = { start: caret, end: caret };
    pendingSelection.current = { start: caret, end: caret };
  }

  return (
    <form className="composer" onSubmit={handleSubmit} aria-label="Send a message">
      <div className="composer-box">
        <label className="sr-only" htmlFor="message-input">Your message</label>
        <textarea
          id="message-input"
          ref={input}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); rememberSelection(event); }}
          onSelect={rememberSelection}
          onBlur={rememberSelection}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setComposition(true)}
          onCompositionEnd={() => setComposition(false)}
          placeholder="Write a message to the lab…"
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          readOnly={isSending}
          aria-describedby="composer-help message-length"
        />
        <div className="composer-actions">
          <div className="composer-tools">
            <EmojiPicker onSelect={insertEmoji} disabled={isSending || composing} />
            <span className="composer-tools-hint">A little hello goes a long way.</span>
          </div>
          <button className="send-button" type="submit" disabled={isSending || !isValidMessage(draft)} aria-label="Send message" aria-busy={isSending}>
            <span>{isSending ? "Sending…" : "Send"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <p className="sr-only" role="status">{emojiNotice}</p>
      <div className="composer-caption">
        <p id="composer-help"><kbd>Enter</kbd> to send <span aria-hidden="true">·</span> <kbd>Shift + Enter</kbd> for a new line</p>
        <span id="message-length">{draft.length} / {MAX_MESSAGE_LENGTH.toLocaleString("en-US")}</span>
      </div>
    </form>
  );
}
