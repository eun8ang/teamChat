"use client";

import { useEffect, useId, useRef, useState, type FocusEvent } from "react";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

const EMOJI_CHOICES = [
  { emoji: "😀", name: "Grinning face" },
  { emoji: "😊", name: "Smiling face" },
  { emoji: "😂", name: "Face with tears of joy" },
  { emoji: "😍", name: "Smiling face with heart-eyes" },
  { emoji: "👍", name: "Thumbs up" },
  { emoji: "👏", name: "Clapping hands" },
  { emoji: "🎉", name: "Party popper" },
  { emoji: "🔥", name: "Fire" },
  { emoji: "✅", name: "Check mark" },
  { emoji: "❤️", name: "Red heart" },
  { emoji: "👋", name: "Waving hand" },
  { emoji: "⭐", name: "Star" },
] as const;

export function EmojiPicker({ onSelect, disabled = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Drop a stale open panel when sending or IME composition disables insertion.
  if (disabled && open) setOpen(false);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  function toggle() {
    if (disabled) return;
    setOpen((value) => !value);
  }

  function choose(emoji: string) {
    if (disabled) return;
    onSelect(emoji);
    setOpen(false);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || rootRef.current?.contains(next)) return;
    setOpen(false);
  }

  return (
    <div className="emoji-picker" ref={rootRef} onBlur={handleBlur}>
      <button
        type="button"
        className="emoji-button"
        ref={triggerRef}
        aria-label="Insert emoji"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={toggle}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 14a4.4 4.4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="9" cy="9" r="1" fill="currentColor" />
          <circle cx="15" cy="9" r="1" fill="currentColor" />
        </svg>
      </button>
      <div
        id={panelId}
        ref={panelRef}
        className="emoji-picker-panel"
        role="dialog"
        aria-label="Choose an emoji"
        aria-modal="false"
        hidden={!expanded}
      >
        {EMOJI_CHOICES.map((choice) => (
          <button key={choice.name} type="button" className="emoji-choice" aria-label={choice.name} onClick={() => choose(choice.emoji)}>
            <span aria-hidden="true">{choice.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
