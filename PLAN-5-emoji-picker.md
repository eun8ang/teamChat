# Plan: Accessible emoji picker (#5, CHAT-01)

- **GitHub issue:** #5 "Insert emoji into a message with an accessible picker" (CHAT-01 is only the catalog ID)
- **Branch:** `feature/5-emoji-picker`, created from `origin/develop` @ `c7ba337`, no upstream yet
- **PR base:** `develop`
- **Files to change:** `src/components/chat/EmojiPicker.tsx`, `src/components/chat/MessageComposer.tsx`, `src/app/globals.css`, `tests/chat.test.tsx`
- **Do not touch:** shared hooks/types, `src/app/page.tsx`, `src/config/chat.ts` (`CHAT_TITLE`), Redis/API code, `.env*`, lockfile

> This file is a working note. Do not stage or commit it.

## Current state

- `EmojiPicker` is a disabled button with no props. It sits inside `.composer-tools` in `MessageComposer`.
- `MessageComposer` owns `draft`, the `input` textarea ref, an `isComposing` ref, and a `submissionInProgress` ref. The textarea has `maxLength={MAX_MESSAGE_LENGTH}` (1,000 UTF-16 units) and is `readOnly` while sending.
- Draft recovery (#15) is still open and not merged, so `setDraft` is the only draft update path.
- `@testing-library/user-event` 14.6.8 is installed. The existing tests use `fireEvent` with fake timers.

## 1. `EmojiPicker.tsx`: presentational picker

**Props:** `{ onSelect: (emoji: string) => void; disabled: boolean }`. The picker holds no draft state.

**Static data:** a local `const EMOJI = [{ emoji, name }]` with 16 familiar emoji, each with an English name. For example: 😀 Grinning face, 😂 Face with tears of joy, 😊 Smiling face, 😍 Heart eyes, 🤔 Thinking face, 😮 Surprised face, 😢 Crying face, 🙏 Folded hands, 👍 Thumbs up, 👏 Clapping hands, 👋 Waving hand, 🎉 Party popper, 🔥 Fire, ❤️ Red heart, ✅ Check mark, 🚀 Rocket. The picker needs no dependency or remote API.

**Structure:**
- A root `<div className="emoji-picker" ref={root}>`.
- The trigger is a `<button type="button">` with:
  - `aria-label="Insert emoji"`
  - `aria-expanded={open}` and `aria-controls={panelId}` (from `useId()`)
  - `disabled={disabled}`
  - the existing SVG icon
- The panel is `<div id={panelId} role="group" aria-label="Emoji" hidden={!open}>`. It holds one `<button type="button" aria-label={name} title={name}>` per emoji, with the glyph wrapped in `aria-hidden`.
  - Use plain Tab-reachable buttons and no `role="menu"`. That way there is no arrow-key contract to fulfil and no keyboard trap.

**Behaviour:**
- **Open:** a click on the trigger, which also covers Enter and Space, toggles `open`. When it opens, focus moves to the first emoji button in an effect.
- **Select:** a click on an emoji (or Enter/Space on it) calls `onSelect(emoji)`, then `setOpen(false)`. The composer moves focus back to the textarea.
- **Escape:** a `keyDown` handler on the root catches Escape while open. It calls `preventDefault`, closes the panel, and focuses the trigger.
- **Outside activation:** while open, a `document` `pointerdown` listener closes the panel when the target is outside `root`. It does not call `preventDefault` or move focus, so the newly activated control keeps focus.
- **Tab out:** an `onBlur` on the root closes the panel when `relatedTarget` is outside `root`. Tab therefore leaves naturally.
- **Disabled while open:** if `disabled` becomes true, an effect closes the panel.

## 2. `MessageComposer.tsx`: insertion logic

Add the following and leave the submit and keyboard logic as it is:

- **`selection` ref** (`{ start, end } | null`, initially `null`): record it from `input.selectionStart/End` in the textarea's `onSelect` and `onBlur`. The blur fires before focus reaches the picker, so this captures the caret first. `null` means "never focused", and insertion then goes at the end.
- **`composing` state**, mirroring the existing `isComposing` ref. Set it in `onCompositionStart` and `onCompositionEnd`. The ref keeps the keyDown guard synchronous; the state re-renders the picker's `disabled` prop.
- **`notice` state:** a short message in a polite live region, `<p role="status" className="composer-notice">`, inside `.composer-caption` or just above it. Clear it in the textarea's `onChange` and after any successful insertion.
- **`insertEmoji(emoji)`:**
  1. Return early if `isSending || isComposing.current || submissionInProgress.current`.
  2. Clamp `start` and `end` to `draft.length`, falling back to `draft.length` for both. The draft may have been cleared since the selection was recorded.
  3. Build `next = draft.slice(0, start) + emoji + draft.slice(end)`.
  4. If `next.length > MAX_MESSAGE_LENGTH`, set the notice to "Emoji not added: the message would exceed 1,000 characters." and return without changing the draft. The insertion is all or nothing, so a surrogate pair is never split.
  5. Otherwise call `setDraft(next)` (the single draft update path, so #15 can hook in later) and store the pending caret `start + emoji.length` in a ref.
- **`useLayoutEffect` on `draft`:** when a pending caret exists, call `input.current.focus()` and `setSelectionRange(caret, caret)`, then update `selection` and clear the pending ref.
- **Render:** `<EmojiPicker onSelect={insertEmoji} disabled={isSending || composing} />`.

The `maxLength` attribute stays, so typing and insertion share the same 1,000-unit limit.

## 3. `globals.css`: styles

- `.emoji-picker { position: relative; }`
- Trigger: raise the icon colour from `#a9a0b6` to about `#6f6680` to meet 3:1 non-text contrast on white. Add hover and `[aria-expanded="true"]` tints using `--purple`. Keep the reduced opacity for `:disabled`.
- `.emoji-panel`:
  - `position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 5`
  - `display: grid; grid-template-columns: repeat(4, 36px); gap: 4px; padding: 8px`
  - `background: var(--surface); border: 1px solid #e2dfe9; border-radius: 10px; box-shadow`
  - `max-width: calc(100vw - 32px)`
- `.emoji-option`: 36px square, transparent background, 20px glyph, `--purple-soft` on hover, and the global `:focus-visible` outline (visible against white).
- `.composer-notice`: small text in a readable colour, about `#8a3b3b` or `var(--ink)`. The existing `#aaa2b4` caption grey fails contrast.
- `@media (max-width: 760px)`: 40px tap targets, still four columns, and the panel stays inside the viewport. Remember that `.composer-tools-hint` is hidden at this width.
- `prefers-reduced-motion`: add no animation, or disable any that is added.

## 4. Tests in `tests/chat.test.tsx`

Add a `describe("emoji picker")` block that renders `<MessageComposer onSend={onSend} isSending={...} />`. Use `fireEvent`, which suits the global fake timers, and do not modify the existing composer tests.

1. **Empty draft:** open the picker and choose "Thumbs up". The value becomes `👍`, `onSend` is not called, no form submission happens, and the panel closes with `aria-expanded="false"`.
2. **Caret insert:** with value `"Hello world"` and the caret at 5 (`setSelectionRange` plus `fireEvent.select`), insert. Expect `"Hello👍 world"`, `document.activeElement === input`, and `selectionStart === selectionEnd === 7`.
3. **Selection replace:** select `"world"` and insert. Expect `"Hello 👍"` with the caret at the end of the emoji.
4. **Length limit:** a 999-character draft plus 👍 (2 units) is rejected. The value is unchanged and the `role="status"` element contains the explanation. A 998-character draft plus 👍 succeeds, filling exactly 1,000 units.
5. **Keyboard dismissal:** open the picker; focus is on the first option. Escape closes the panel (`aria-expanded="false"`, the panel is hidden) and returns focus to the trigger.
6. **Disabled states:** with `isSending` true, the trigger is disabled. After `compositionStart` the trigger is disabled; after `compositionEnd` it is enabled again.
7. **Accessible names:** every option has a readable name, there are at least 12 options, and every button has `type="button"`.

Keep these existing tests passing: Shift+Enter, Korean composition, `isComposing`/`keyCode 229`, whitespace blocking, and the send success/failure tests.

## 5. Validation

```bash
node -v          # expect v24.x
npm ci
npm run check    # version:check, lint, typecheck, vitest run, next build
```

Manual checks with `npm run dev` and a local `CHAT_ROOM_PREFIX` (never the Production one):

- [ ] Insert into an empty draft, mid-text, and over a selected range; the caret lands after the emoji
- [ ] Near-limit text: an insertion that exactly fits works; one that would exceed is rejected with the notice
- [ ] Korean IME: the picker is disabled mid-composition; Enter and Shift+Enter still work
- [ ] Keyboard only: Tab to the trigger, Enter opens, Tab through the options, Space selects, Escape closes, Tab leaves the picker
- [ ] Clicking outside closes the picker without stealing focus
- [ ] Mobile width (about 375px): the panel fits on screen, tap targets are usable, focus is visible
- [ ] Send an emoji message and see it in a second browser session (Redis-backed)
- [ ] A failed send keeps the draft; a successful send clears it

Record results and list any check that was not run, with the reason.

## 6. Delivery (only when the user requests it)

- Run `/git-issue-pr` before drafting any commit message or PR text.
- Suggested commit message: `feat: add accessible emoji picker to composer (#5)`
- Stage only the four files listed at the top. Never stage this plan, `.idea/`, or env files.
- The PR goes to `develop`. Its body has a standalone `Fixes #5` line and covers the behaviour, implementation choices, validation results, and remaining limitations: no emoji search or categories, a fixed set of 16 emoji, and no arrow-key grid navigation.
- Push, PR creation, and merge happen only with explicit authorization. A human reviewer must approve the PR.

## Notes

- Earlier I created an empty branch, `feature/someFunctions`, from `origin/develop`. It has no commits and can be deleted with `git branch -d feature/someFunctions` if it is not needed.
