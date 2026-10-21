"use client";

import { useEffect, useId, useRef, useState, type FocusEvent } from "react";

export const EMOJI_OPTIONS = [
  { emoji: "😀", name: "Grinning face" },
  { emoji: "😂", name: "Face with tears of joy" },
  { emoji: "😊", name: "Smiling face" },
  { emoji: "😍", name: "Smiling face with heart-eyes" },
  { emoji: "😎", name: "Smiling face with sunglasses" },
  { emoji: "🤔", name: "Thinking face" },
  { emoji: "😮", name: "Surprised face" },
  { emoji: "😢", name: "Crying face" },
  { emoji: "👍", name: "Thumbs up" },
  { emoji: "👏", name: "Clapping hands" },
  { emoji: "🙌", name: "Raising hands" },
  { emoji: "🙏", name: "Folded hands" },
  { emoji: "🎉", name: "Party popper" },
  { emoji: "❤️", name: "Red heart" },
  { emoji: "🔥", name: "Fire" },
  { emoji: "✅", name: "Check mark button" },
] as const;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelect, disabled = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const isOpen = open && !disabled;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Outside pointer activation closes the panel without moving focus to the trigger.
  // Escape works wherever focus is, since some browsers do not focus a button on click.
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      const focusWasInside = rootRef.current?.contains(document.activeElement) ?? false;
      event.preventDefault();
      setOpen(false);
      if (focusWasInside) triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Keyboard focus leaving the picker closes it, without trapping Tab.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  function handleSelect(emoji: string) {
    setOpen(false);
    // Focus the trigger first; the composer moves focus to the textarea after a successful insert.
    triggerRef.current?.focus();
    onSelect(emoji);
  }

  return (
    <div className="emoji-picker" ref={rootRef} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="emoji-button"
        aria-label="Insert emoji"
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="Insert emoji"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 14a4.4 4.4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="9" cy="9" r="1" fill="currentColor" />
          <circle cx="15" cy="9" r="1" fill="currentColor" />
        </svg>
      </button>
      <div id={panelId} className="emoji-panel" role="group" aria-label="Emoji choices" hidden={!isOpen}>
        {EMOJI_OPTIONS.map(({ emoji, name }) => (
          <button
            key={emoji}
            type="button"
            className="emoji-option"
            aria-label={name}
            title={name}
            onClick={() => handleSelect(emoji)}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
