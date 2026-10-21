# Copy a message's text with clear success or failure feedback

| Field | Value |
| --- | --- |
| Ticket ID | CHAT-13 |
| Difficulty | Beginner |
| Estimate | 20–30 minutes |
| Prerequisites | None; implement against the latest `origin/develop` |
| Primary files | `src/components/chat/MessageBubble.tsx`, a small `CopyMessageButton.tsx` component, `src/app/globals.css` |

## Goal

Add a copy action to each message so a participant can reuse its text without manually selecting it. Treat this issue body as the implementation brief for Codex or Claude Code.

## Current behavior

`MessageBubble` displays the author, UTC timestamp, and message content as plain React text. There are no message actions. The app already distinguishes the current participant's messages visually, and received messages are stored through the shared Redis-backed API.

## Implementation requirements

1. Add a small copy button to each message, including own and other participants' messages. Keep browser clipboard behavior in a focused client component, such as `CopyMessageButton`, to avoid unrelated message-rendering changes.
2. Invoke `navigator.clipboard.writeText(message.content)` directly from the participant's button activation. Copy the exact content, including newlines, whitespace, emoji, and any URL text; omit author, timestamp, and surrounding UI labels.
3. Show and politely announce “Copied” only after the clipboard promise resolves successfully. If the API is missing, the page lacks clipboard access, or writing rejects, show a useful message such as “Could not copy. Select the message text and copy it manually.” Do not report false success or request permission on page load.
4. Keep the action usable by pointer, touch, and keyboard. Give it an accessible name that identifies its message context, use `type="button"`, and provide visible focus. Do not hide the only usable control behind hover-only behavior on touch devices.
5. Keep feedback local to the activated message and reset stale success/failure feedback on a new attempt. Prevent a pending copy operation from producing duplicate/conflicting feedback, and clean up any feedback-reset timers on unmount.
6. Do not mutate, resend, or delete the message, and do not change browser text selection merely to copy. A deprecated clipboard fallback is unnecessary; the manual-copy failure message is sufficient.
7. Keep long messages, narrow layouts, and author/timestamp alignment readable. If image or YouTube rendering has already been merged, copy the stored message content rather than rendered HTML or an iframe URL assembled by the player.
8. Keep implementation within the message presentation/action components and scoped styles. Do not change the message API, shared hooks, or shared message types for this feature.

## Acceptance criteria

- [ ] A participant can copy any displayed message using pointer, touch, or keyboard.
- [ ] The copied string is exactly `message.content`, including multiline and emoji content.
- [ ] Success feedback appears only after a successful clipboard write.
- [ ] Missing or rejected clipboard access produces helpful failure feedback and never says “Copied”.
- [ ] Activating one message's action does not change another message's feedback.
- [ ] The copy action does not submit the composer, alter a draft, send a request to the chat API, or change the message.
- [ ] The action and feedback remain readable and accessible on a narrow screen.
- [ ] Existing message rendering and shared chat behavior remain intact.

## Validation

Use Node.js 24 and run `npm ci`, then run `npm run check`. Add focused component tests with a mocked Clipboard API for exact copied content, pending-versus-success timing, a rejected write, and a missing API. Verify feedback is scoped to the selected message.

Manually copy multiline text in a secure browser context, paste it into a text editor, and test keyboard and narrow-screen access. Record command results and explicitly identify any checks not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

- Read and follow `AGENTS.md` and `CONTRIBUTING.md`. Begin with `git status`; protect existing work. Fetch origin and create a fresh branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-copy-message`. Do not reuse a merged feature branch.
- Preserve Redis-backed shared message persistence, server-only Redis credentials, and the separate Production/Preview/local `CHAT_ROOM_PREFIX` values. Do not reset history, change the current `CHAT_TITLE` in `src/config/chat.ts`, add paid services, or commit secrets, `.env*`, `.vercel`, dependencies, or build output.
- Keep shared hooks, shared types, and page assembly changes minimal. Review the diff and stage only relevant files when the participant requests a commit.
- Prepare a suggested commit message and PR summary explaining behavior, implementation choices, validation, and remaining limitations. Use the actual GitHub issue number in `Fixes #<actual issue number>`; `CHAT-13` is a catalog ID, not a GitHub issue number. Set PR base to `develop` and follow `CONTRIBUTING.md` for issue status.
- The author must explain the change and another human must review it. AI feedback does not replace human approval. Push, open a PR, or deploy only within the participant's explicit authorization.
