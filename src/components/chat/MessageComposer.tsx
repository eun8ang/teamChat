"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { MAX_MESSAGE_LENGTH } from "@/config/chat";
import { isValidMessage } from "@/lib/message";

interface MessageComposerProps {
  onSend: (content: string) => Promise<boolean>;
  isSending: boolean;
}

interface Caret {
  start: number;
  end: number;
  focused: boolean;
}

const LIMIT_NOTICE = "That emoji doesn’t fit in the remaining message length.";

function clampIndex(value: number, length: number) {
  if (!Number.isFinite(value)) return length;
  return Math.min(Math.max(value, 0), length);
}

function isSplitSurrogatePair(text: string, index: number) {
  if (index <= 0 || index >= text.length) return false;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export function MessageComposer({ onSend, isSending }: MessageComposerProps) {
  const [draft, setDraft] = useState("");
  const [limitNotice, setLimitNotice] = useState("");
  const [isComposingInput, setIsComposingInput] = useState(false);
  const [caretPlacement, setCaretPlacement] = useState(0);
  const isComposing = useRef(false);
  const submissionInProgress = useRef(false);
  const caretLocked = useRef(false);
  const caret = useRef<Caret>({ start: 0, end: 0, focused: false });
  const pendingCaret = useRef<{ start: number; end: number } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    const element = input.current;
    if (!pending || !element) return;
    element.focus({ preventScroll: true });
    element.setSelectionRange(pending.start, pending.end);
    caret.current = { start: pending.start, end: pending.end, focused: true };
    caretLocked.current = false;
  }, [caretPlacement]);

  function writeCaret() {
    const element = input.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (start == null || end == null) return;
    caret.current = { start, end, focused: true };
  }

  function rememberCaret() {
    if (caretLocked.current) return;
    writeCaret();
  }

  useEffect(() => {
    function handleSelectionChange() {
      if (caretLocked.current || document.activeElement !== input.current) return;
      writeCaret();
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // The picker can take focus before this event runs. The textarea keeps its selection, so read that range whenever the field has been used.
  function captureCaretBeforePicker(event: SyntheticEvent<HTMLFormElement>) {
    const target = event.target;
    const element = input.current;
    if (!element || !(target instanceof Element) || !target.closest(".emoji-picker")) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (start == null || end == null) return;
    if (document.activeElement !== element && !caret.current.focused) return;
    caret.current = { start, end, focused: true };
    caretLocked.current = true;
  }

  function placeCaret(start: number, end: number) {
    pendingCaret.current = { start, end };
    caret.current = { start, end, focused: true };
    setCaretPlacement((value) => value + 1);
  }

  function insertEmoji(emoji: string) {
    if (isSending || isComposing.current || submissionInProgress.current) return;
    const current = draft;
    const hasCaret = caret.current.focused;
    const rawStart = hasCaret ? caret.current.start : current.length;
    const rawEnd = hasCaret ? caret.current.end : current.length;
    const from = clampIndex(Math.min(rawStart, rawEnd), current.length);
    const to = clampIndex(Math.max(rawStart, rawEnd), current.length);
    const start = isSplitSurrogatePair(current, from) ? from - 1 : from;
    const end = from === to ? start : isSplitSurrogatePair(current, to) ? to + 1 : to;
    const next = current.slice(0, start) + emoji + current.slice(end);
    caretLocked.current = false;
    if (next.length > MAX_MESSAGE_LENGTH) {
      setLimitNotice(LIMIT_NOTICE);
      placeCaret(start, end);
      return;
    }
    setLimitNotice("");
    setDraft(next);
    placeCaret(start + emoji.length, start + emoji.length);
  }

  async function submit() {
    if (isComposing.current || isSending || submissionInProgress.current || !isValidMessage(draft)) return;
    submissionInProgress.current = true;
    try {
      if (await onSend(draft)) {
        setDraft("");
        setLimitNotice("");
        caret.current = { start: 0, end: 0, focused: true };
        input.current?.focus({ preventScroll: true });
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

  function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    caretLocked.current = false;
    caret.current = {
      start: event.target.selectionStart ?? value.length,
      end: event.target.selectionEnd ?? value.length,
      focused: true,
    };
    setLimitNotice("");
    setDraft(value);
  }

  function handleFocus() {
    caretLocked.current = false;
    rememberCaret();
  }

  function handleCompositionStart() {
    isComposing.current = true;
    setIsComposingInput(true);
  }

  function handleCompositionEnd() {
    isComposing.current = false;
    setIsComposingInput(false);
  }

  return (
    <form className="composer" onSubmit={handleSubmit} onPointerDown={captureCaretBeforePicker} onMouseDown={captureCaretBeforePicker} aria-label="Send a message">
      <div className="composer-box">
        <label className="sr-only" htmlFor="message-input">Your message</label>
        <textarea
          id="message-input"
          ref={input}
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
          onKeyUp={rememberCaret}
          onClick={rememberCaret}
          onSelect={rememberCaret}
          onFocus={handleFocus}
          onBlur={rememberCaret}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="Write a message to the lab…"
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          readOnly={isSending}
          aria-describedby="composer-help message-length emoji-limit"
        />
        <div className="composer-actions">
          <div className="composer-tools">
            <EmojiPicker onSelect={insertEmoji} disabled={isSending || isComposingInput} />
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
      <div className="composer-caption">
        <p id="composer-help"><kbd>Enter</kbd> to send <span aria-hidden="true">·</span> <kbd>Shift + Enter</kbd> for a new line</p>
        <span id="message-length">{draft.length} / {MAX_MESSAGE_LENGTH.toLocaleString("en-US")}</span>
      </div>
      <p id="emoji-limit" role="status" className={limitNotice ? "emoji-limit" : "sr-only"}>{limitNotice}</p>
    </form>
  );
}
