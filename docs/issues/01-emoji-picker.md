# Insert emoji into a message with an accessible picker

| Field | Value |
| --- | --- |
| Ticket ID | CHAT-01 |
| Difficulty | Intermediate |
| Estimate | 35–50 minutes |
| Prerequisites | None; implement against the latest `origin/develop` |
| Primary files | `src/components/chat/EmojiPicker.tsx`, `src/components/chat/MessageComposer.tsx`, `src/app/globals.css` |

## Goal

Implement an emoji picker that lets a participant insert emoji into the current message without losing their text or cursor position. Treat this issue body as the implementation brief for Codex or Claude Code.

## Current behavior

`EmojiPicker` is a disabled button inside `MessageComposer`. The composer owns the draft and textarea ref, enforces `MAX_MESSAGE_LENGTH` (currently 1,000 JavaScript string units), sends with Enter, inserts a newline with Shift+Enter, and protects Korean and other IME composition. A successful send clears the draft; a failed send keeps it.

## Implementation requirements

1. Replace the disabled slot with a small picker containing at least 12 familiar emoji. Use a local, static collection with readable English names; a remote API or large emoji dependency is unnecessary.
2. Keep draft ownership in `MessageComposer`. Give `EmojiPicker` a small callback such as `onSelect(emoji: string)` and a disabled state, rather than moving draft state into the picker.
3. Record the textarea selection before focus moves to the picker. Insert at that caret or replace the selected range, preserve the rest of the draft, return focus to the textarea, and place the caret immediately after the inserted emoji. If the participant has never focused the textarea, insert at the end.
4. Apply the same length limit as the textarea to the resulting draft. Insert the complete emoji only when it fits; otherwise leave the draft unchanged and announce a short explanation. Never truncate an emoji or silently discard existing text.
5. Disable insertion while sending or during active IME composition. Preserve the existing Enter, Shift+Enter, native composition flags, `keyCode === 229`, whitespace validation, duplicate submission protection, and send success/failure behavior.
6. Give the trigger an accessible name and accurate `aria-expanded`/`aria-controls`. Give each emoji button a readable name. Opening the picker must allow keyboard access to choices; Enter/Space selects, Escape closes and returns focus to the trigger, and Tab remains usable without a keyboard trap. Outside activation may close it without stealing the newly focused control's focus.
7. Close the picker after a selection. Use `type="button"` for all picker buttons so selection never submits the form. Keep the panel usable on narrow screens, with visible focus and sufficient contrast.
8. Keep changes within the picker, composer, and relevant styles. If draft recovery has already been merged, ensure emoji insertion uses the same draft update path so it is saved too.

## Acceptance criteria

- [ ] Choosing an emoji in an empty draft inserts it without sending a message.
- [ ] Choosing an emoji in the middle of a draft inserts at the previous caret; choosing with selected text replaces exactly that selection.
- [ ] The textarea regains focus with the caret after the complete emoji.
- [ ] An insertion that would exceed `MAX_MESSAGE_LENGTH` changes no text and provides accessible feedback; an insertion that exactly fits succeeds.
- [ ] Pointer and keyboard users can open, choose, and dismiss the picker; every icon has a readable accessible name.
- [ ] The picker cannot edit the draft while sending or composing text through an IME.
- [ ] Enter, Shift+Enter, Korean IME input, failed-send draft preservation, and successful-send clearing still work.
- [ ] A sent emoji is a normal message persisted by the existing Redis-backed API and visible in another browser session.

## Validation

Use Node.js 24 and run `npm ci`, then run `npm run check`. Add focused interaction coverage for selection replacement, length rejection, and keyboard dismissal, using the existing Vitest/Testing Library setup. Preserve the meaningful composer regression tests in `tests/chat.test.tsx`.

Manually test selection insertion, near-limit text, Korean IME, mobile width, and sending to a second browser session. Record command results and explicitly identify any checks not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

- Read and follow `AGENTS.md` and `CONTRIBUTING.md`. Begin with `git status`; protect existing work. Fetch origin and create a fresh branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-emoji-picker`. Do not reuse a merged feature branch.
- Preserve Redis-backed shared message persistence, server-only Redis credentials, and the separate Production/Preview/local `CHAT_ROOM_PREFIX` values. Do not reset history, change the current `CHAT_TITLE` in `src/config/chat.ts`, add paid services, or commit secrets, `.env*`, `.vercel`, dependencies, or build output.
- Keep shared hooks, shared types, and page assembly changes minimal. Review the diff and stage only relevant files when the participant requests a commit.
- Prepare a suggested commit message and PR summary explaining behavior, implementation choices, validation, and remaining limitations. Use the actual GitHub issue number in `Fixes #<actual issue number>`; `CHAT-01` is a catalog ID, not a GitHub issue number. Set PR base to `develop` and follow `CONTRIBUTING.md` for issue status.
- The author must explain the change and another human must review it. AI feedback does not replace human approval. Push, open a PR, or deploy only within the participant's explicit authorization.
