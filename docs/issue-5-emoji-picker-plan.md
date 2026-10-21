# Issue #5: Accessible emoji picker implementation plan

Source: [Insert emoji into a message with an accessible picker](https://github.com/eun8ang/teamChat/issues/5) (catalog ID: CHAT-01).

## Objective and scope

Let participants insert a complete emoji at the saved textarea caret, or replace the selected text, without losing surrounding text or submitting the message. Keep the existing shared chat behavior intact.

This document is the planning deliverable. Feature implementation, branch creation, commits, pushes, PR creation, and deployment are future work.

## Current code findings

- `src/components/chat/EmojiPicker.tsx` renders a disabled placeholder button.
- `src/components/chat/MessageComposer.tsx` owns `draft`, the textarea ref, an IME composition ref, and a synchronous duplicate-submission ref. Its draft update path is currently `setDraft`; draft recovery is not present.
- The composer already handles Enter, Shift+Enter, native composition flags, `keyCode === 229`, whitespace validation, successful-send clearing, and failed-send preservation.
- `src/config/chat.ts` sets `MAX_MESSAGE_LENGTH` to 1,000 JavaScript string units. Use that constant and UTF-16 string offsets throughout insertion and caret positioning.
- `src/app/globals.css` contains the picker button, composer, focus, and mobile styles.
- `tests/chat.test.tsx` provides Vitest/Testing Library coverage for composer and shared chat behavior. Its fake timers need appropriate handling when adding `userEvent` interactions.

## 1. Prepare the implementation branch

1. Read `AGENTS.md` and `CONTRIBUTING.md` again at implementation time.
2. Start with `git status`; preserve any existing work, including this plan.
3. Fetch `origin`, then create a fresh feature branch from the latest `origin/develop`. Use the repository's `feature/5-emoji-picker` naming convention and do not reuse a merged branch. Resolve a pre-existing branch name without resetting it.
4. Use Node.js 24 and run `npm ci`.
5. Recheck the latest composer for draft recovery. If present, use its existing draft update path for emoji insertion as well as typing.

## 2. Build the picker in `EmojiPicker.tsx`

- Accept `onSelect(emoji: string)` and `disabled` props. Keep draft content and textarea selection in the composer; keep panel visibility and picker focus handling local to the picker.
- Define a local static list of at least 12 familiar emoji with English names, for example: 😀 Grinning face, 😊 Smiling face, 😂 Face with tears of joy, ❤️ Red heart, 👍 Thumbs up, 👏 Clapping hands, 🎉 Party popper, 🚀 Rocket, 👀 Eyes, 🙌 Raising hands, ✅ Check mark, and 💡 Light bulb.
- Use a stable panel ID, an accessible trigger name such as `Insert emoji`, and accurate `aria-expanded`/`aria-controls`. Keep the controlled panel mounted but hidden when closed, so the ID reference remains valid.
- Use a labelled panel containing native buttons. Each choice must have a readable accessible name and `type="button"`; the trigger must also be `type="button"`. Avoid menu/grid roles that require additional keyboard semantics.
- On opening, focus the first choice. Native Enter/Space activation selects a choice. Tab/Shift+Tab follow normal document order without a focus trap.
- Escape from anywhere inside the picker closes it and returns focus to the trigger. Trigger activation can toggle it closed.
- Close after a selection. Let the composer restore textarea focus; do not then move focus back to the trigger.
- Outside pointer activation or focus leaving the picker can close the panel without calling `focus()`, preserving the newly activated control's focus. Clean up document listeners on close/unmount.
- Disable the trigger and choices while unavailable, and close an open panel when `disabled` becomes true without forcibly moving focus.

## 3. Preserve selection and insert in `MessageComposer.tsx`

1. Store the last textarea selection in a ref as `{ start, end }`, using `null` to represent a textarea that has never been focused.
2. Capture `selectionStart` and `selectionEnd` on focus, selection changes, typing, and blur. Blur must save the range before picker focus changes can affect it. Cover both pointer activation and keyboard Tab navigation; do not depend solely on pointer events or prevent normal button focus.
3. Keep selection synchronized after edits and sends. Reset it after successful clearing, so a later insertion cannot reuse an old range. Clamp saved offsets to the current draft length before use.
4. On selection, guard against `isSending`, the synchronous submission-in-progress ref, and active IME composition before changing any text. Mirror IME activity in reactive state so the picker visibly disables on composition start, while retaining the ref for immediate event guards.
5. If no range was ever recorded, use `draft.length` for both offsets. Construct the candidate without altering the surrounding text:

   ```ts
   const nextDraft = draft.slice(0, start) + emoji + draft.slice(end);
   const nextCaret = start + emoji.length;
   ```

6. Accept only when `nextDraft.length <= MAX_MESSAGE_LENGTH`. Do not slice the result or the emoji, and do not drop existing text to make room. Selection replacement must account for the removed text when calculating the limit.
7. If rejected, leave draft content and its saved selection unchanged. Announce a short explanation, such as `This emoji would exceed the message limit.`, through a persistent live region associated with the textarea. Ensure repeated rejected attempts can be announced again. Close the picker and restore textarea focus and the original range.
8. If accepted, update through the same draft path as normal typing, clear stale feedback, and queue the new caret position. After React commits the controlled value, focus the textarea and call `setSelectionRange(nextCaret, nextCaret)`, for example through a layout effect dedicated to pending selection restoration.
9. Preserve the existing submit and keydown guards, whitespace validation, duplicate-send protection, and success/failure behavior. Selecting an emoji must never call `onSend`.

## 4. Add focused styles in `globals.css`

- Position the panel relative to the picker near the composer; avoid changing page assembly.
- Use a compact wrapping layout with a viewport-constrained width and usable height/overflow on narrow or short screens.
- Give trigger and choice buttons clear focus indicators, sufficient foreground/background contrast, and comfortable touch targets. Keep the feedback readable.
- Verify the panel is not clipped by ancestors and does not cause horizontal scrolling at 320–375 px widths.

## 5. Add interaction coverage

Extend `tests/chat.test.tsx`, preserving its existing meaningful composer regressions. Use `userEvent` for actual keyboard/focus sequences; configure `advanceTimers` for the existing fake timers, or scope real timers carefully to isolated interaction tests.

| Scenario | Required assertions |
| --- | --- |
| Empty draft and never-focused textarea | Complete emoji inserted at the end; no send; textarea focused with caret after emoji. |
| Mid-message insertion | Previous pointer- or keyboard-established caret is respected; surrounding text is unchanged. |
| Selection replacement | Exactly the selected range is replaced; caret follows the complete emoji. |
| Exact length fit | Candidate at 1,000 string units succeeds, including a multi-unit emoji. |
| Length rejection | Candidate over 1,000 units leaves text and range unchanged and announces feedback; repeated rejection remains announced. |
| Replacement near limit | Replacing selected text can free enough space for the complete emoji. |
| Accessible controls | At least 12 named choices; accurate expanded/controls attributes; picker buttons never submit the form. |
| Keyboard opening and selection | Tab to trigger; Enter/Space opens and selects; focus returns to textarea after insertion. |
| Keyboard dismissal | Escape closes and restores trigger focus; Tab/Shift+Tab can leave without a trap. |
| Outside activation | Panel closes while the clicked or newly focused control keeps focus. |
| Sending and IME | Trigger/choices disable; draft cannot change during pending send or composition; composition end enables insertion again. |
| Existing composer behavior | Enter, Shift+Enter, native IME flags, keyCode 229, whitespace rejection, duplicate-submit protection, failed-send preservation, and successful-send clearing still pass. Add focused coverage where currently absent. |

## 6. Validate the completed feature

Run `npm run check` after implementation. It runs ESLint, Next.js/TypeScript checks, Vitest, and a production build. Record actual command outcomes and identify checks that could not run.

Manually verify:

- Pointer and keyboard insertion into empty, middle, and selected text; focus and caret after each choice.
- Exact-fit and rejected multi-unit emoji insertion near the limit, including replacing a selection.
- Korean IME composition and Enter behavior in a real browser, plus Shift+Enter and failed/successful sends.
- Keyboard dismissal, Tab navigation, outside activation, live-region feedback, contrast, and narrow mobile layout.
- Send an emoji through the existing Redis-backed API; observe it in a second browser session and after refresh. Use an approved development/Preview room and preserve its configured prefix.
- If draft recovery exists by implementation time, verify inserted emoji follow the same persistence/restoration behavior as typed text.

## 7. Review and handoff

- Keep implementation changes within the picker, composer, related CSS, and relevant interaction tests. Preserve Redis persistence, API contracts, server-only credentials, room prefixes, chat history, and the current `CHAT_TITLE`. Add no paid service, remote emoji API, or large emoji dependency.
- Review `git diff` and `git status`; do not stage unrelated work, secrets, `.env*`, `.vercel`, dependencies, or build output. Stage or commit only when requested.
- Before preparing any suggested commit subject or PR title/body, read and apply `.agents/skills/git-issue-pr/SKILL.md`. This path is absent in the inspected checkout; locate the required skill or report its absence before generating those artifacts.
- The issue requires English Conventional Commit subjects/titles using `feat`, a PR targeting `develop`, and a standalone `Fixes #5` only when fully resolved (`Refs #5` for partial work). The current `CONTRIBUTING.md` describes an older `Refs` workflow; recheck the latest branch and required skill before delivery and record this discrepancy if it remains.
- Explain behavior, implementation choices, validation results, and remaining limitations in the eventual handoff. Another human must review; AI feedback does not replace approval.
- Push, open a PR, or deploy only with explicit authorization. Do not close the issue merely because a plan or PR exists. The issue's future closure workflow depends on verified integration into `develop`, which does not mean Production deployment.

## Planning validation record

- Initial `git status --short --branch`: clean `develop` tracking `origin/develop`.
- Inspected the linked issue, attached brief, repository guidance, picker, composer, styles, configuration, package scripts, and existing interaction tests.
- Runtime: Node.js `v24.22.0`, npm `11.19.1`.
- `npm ci`: passed; npm reported 34 existing dependency vulnerabilities (8 moderate, 26 high), an ESLint deprecation warning, and install-script approval warnings. No dependency versions or lockfile were changed.
- `npm run check`: passed ESLint, type checking, all 48 tests across 5 files, and the production build. These checks validate the current baseline, not the future emoji feature.
- `git diff --check`: passed. Final working-tree review showed only this new plan file.
- Feature interaction tests and manual browser/Redis checks: not run; the feature has not been implemented in this planning task.
- No remote fetch, branch creation, commit, push, PR, or deployment performed for this planning task.
