"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

// A small local set keeps the bundle light; names double as accessible labels.
export const EMOJI_CHOICES = [
  { emoji: "😀", name: "Grinning face" },
  { emoji: "😂", name: "Face with tears of joy" },
  { emoji: "😍", name: "Smiling face with heart-eyes" },
  { emoji: "🤔", name: "Thinking face" },
  { emoji: "👋", name: "Waving hand" },
  { emoji: "👍", name: "Thumbs up" },
  { emoji: "👏", name: "Clapping hands" },
  { emoji: "🙏", name: "Folded hands" },
  { emoji: "❤️", name: "Red heart" },
  { emoji: "🎉", name: "Party popper" },
  { emoji: "🔥", name: "Fire" },
  { emoji: "✨", name: "Sparkles" },
  { emoji: "🚀", name: "Rocket" },
  { emoji: "👀", name: "Eyes" },
  { emoji: "✅", name: "Check mark" },
  { emoji: "💯", name: "Hundred points" },
] as const;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelect, disabled = false }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  if (disabled && isOpen) setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    panel.current?.querySelector("button")?.focus();
    // Close on outside pointer activation without moving focus away from what was activated.
    function handlePointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(false);
    trigger.current?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    // Tabbing out closes the panel so focus is never trapped inside it.
    if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) setIsOpen(false);
  }

  function choose(emoji: string) {
    setIsOpen(false);
    onSelect(emoji);
  }

  return (
    <div className="emoji-picker" ref={root} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        ref={trigger}
        type="button"
        className="emoji-button"
        aria-label="Insert emoji"
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="Insert emoji"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 14a4.4 4.4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="9" cy="9" r="1" fill="currentColor" />
          <circle cx="15" cy="9" r="1" fill="currentColor" />
        </svg>
      </button>
      <div id={panelId} ref={panel} className="emoji-panel" role="group" aria-label="Emoji" hidden={!isOpen}>
        {EMOJI_CHOICES.map(({ emoji, name }) => (
          <button key={name} type="button" className="emoji-choice" aria-label={name} title={name} onClick={() => choose(emoji)}>
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
