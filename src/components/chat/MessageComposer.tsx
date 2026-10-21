"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { MAX_MESSAGE_LENGTH } from "@/config/chat";
import { isValidMessage } from "@/lib/message";

interface MessageComposerProps {
  onSend: (content: string) => Promise<boolean>;
  isSending: boolean;
}

interface Selection {
  start: number;
  end: number;
}

// True when index falls between the high and low halves of one UTF-16 surrogate pair.
function isSplitSurrogatePair(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export function MessageComposer({ onSend, isSending }: MessageComposerProps) {
  const [draft, setDraft] = useState("");
  const [emojiNotice, setEmojiNotice] = useState("");
  const isComposing = useRef(false);
  const submissionInProgress = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  // Last known caret or selection. Null means the participant has not focused the textarea yet.
  const lastSelection = useRef<Selection | null>(null);
  // Caret position to restore after an emoji insert, applied once the new draft reaches the DOM.
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const textarea = input.current;
    if (caret === null || !textarea) return;
    pendingCaret.current = null;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    lastSelection.current = { start: caret, end: caret };
  }, [draft]);

  function rememberSelection(textarea: HTMLTextAreaElement) {
    lastSelection.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }

  function insertEmoji(emoji: string) {
    if (isSending) return;
    if (isComposing.current) {
      setEmojiNotice("Finish composing your text before adding an emoji.");
      return;
    }

    const length = draft.length;
    const selection = lastSelection.current ?? { start: length, end: length };
    // Snap the range outward so an existing emoji is never split across the boundary.
    const rawFrom = Math.min(selection.start, length);
    const rawTo = Math.min(Math.max(selection.end, rawFrom), length);
    const from = isSplitSurrogatePair(draft, rawFrom) ? rawFrom - 1 : rawFrom;
    // A collapsed caret stays collapsed, so it inserts without replacing anything.
    const to = rawTo === rawFrom ? from : isSplitSurrogatePair(draft, rawTo) ? rawTo + 1 : rawTo;
    const nextDraft = draft.slice(0, from) + emoji + draft.slice(to);

    if (nextDraft.length > MAX_MESSAGE_LENGTH) {
      setEmojiNotice(`Emoji not added. The message can be at most ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`);
      return;
    }

    setEmojiNotice("");
    pendingCaret.current = from + emoji.length;
    setDraft(nextDraft);
  }

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

  return (
    <form className="composer" onSubmit={handleSubmit} aria-label="Send a message">
      <div className="composer-box">
        <label className="sr-only" htmlFor="message-input">Your message</label>
        <textarea
          id="message-input"
          ref={input}
          value={draft}
          onChange={(event) => {
            rememberSelection(event.target);
            setEmojiNotice("");
            setDraft(event.target.value);
          }}
          onSelect={(event) => rememberSelection(event.currentTarget)}
          onBlur={(event) => rememberSelection(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; }}
          placeholder="Write a message to the lab…"
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          readOnly={isSending}
          aria-describedby="composer-help message-length emoji-notice"
        />
        <div className="composer-actions">
          <div className="composer-tools">
            <EmojiPicker disabled={isSending} onSelect={insertEmoji} />
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
      <p id="emoji-notice" className="composer-notice" role="status">{emojiNotice}</p>
    </form>
  );
}
