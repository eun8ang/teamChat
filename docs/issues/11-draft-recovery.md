# Restore an unsent message after refreshing the tab

| Field | Value |
| --- | --- |
| Ticket ID | CHAT-11 |
| Difficulty | Intermediate |
| Estimate | 35–50 minutes |
| Prerequisites | None; implement against the latest `origin/develop` |
| Primary files | `src/components/chat/MessageComposer.tsx`, `src/app/page.tsx`; optionally a focused draft-storage helper |

## Goal

Keep an unsent message available after a participant refreshes the same browser tab, without sending it automatically. Treat this issue body as the implementation brief for Codex or Claude Code.

## Current behavior

`MessageComposer` holds its draft only in React state. A failed send keeps that draft while the component stays mounted, and an accepted send clears it. Refreshing loses it. `useIdentity` already restores a tab identity from `sessionStorage`; `Home` mounts the composer only after identity restoration is ready and a participant has joined.

## Implementation requirements

1. Save drafts to `sessionStorage`, scoped to the current `clientId`, using an application key such as `team-chat-draft:<clientId>`. This is a personal tab draft, not shared message storage. Do not save drafts to Redis, `localStorage`, the URL, or a remote service.
2. Pass a small optional prop such as `draftKey?: string` from `Home` to `MessageComposer`, derived only after the existing identity is ready. Keep the existing composer usable when the prop is omitted, including existing component tests. Do not move identity management into the composer or expose `CHAT_ROOM_PREFIX` to the browser.
3. Restore once for the active key after client hydration, before saving the initial empty state. Do not erase a stored draft during restoration or React Strict Mode effect replays. If the key changes, load the new identity's draft without writing the previous identity's text under it.
4. Save edits, including multiline text and emoji, without trimming the draft. Remove the key when the participant clears the draft. Honor `MAX_MESSAGE_LENGTH`; safely limit an oversized stored draft before it reaches the textarea, keeping the existing length unit and never leaving a broken surrogate pair.
5. Clear both stored and visible draft only after `onSend` resolves `true`. Keep both on a `false` result or failed send. Never resubmit a restored draft automatically and do not alter the hook's existing retry/idempotency behavior.
6. Wrap every storage read, write, and removal in safe error handling. A browser denying storage or reporting quota exhaustion must still allow normal typing, sending, and in-memory failed-send recovery. Keep storage operations out of server rendering.
7. Show a small accessible “Draft restored in this tab” status when nonempty content is restored. Avoid promising durability if saving is unavailable. Do not add a modal, confirmation flow, or remote synchronization.
8. Preserve Enter/Shift+Enter, IME composition, length validation, send locking, and focus after successful send. If an emoji picker is already merged, save its draft edits through the same path.

## Acceptance criteria

- [ ] Type a multiline draft, refresh the same tab, and recover exactly that text with the same identity.
- [ ] A restored draft is never sent without participant action.
- [ ] Clearing the textarea removes its saved draft; refreshing does not restore old text.
- [ ] An accepted send clears saved and visible content; a rejected or failed send retains both.
- [ ] Drafts for different client IDs do not overwrite or restore one another.
- [ ] Initial hydration and Strict Mode remount/effect behavior do not overwrite a saved draft with an empty value.
- [ ] Unavailable storage and oversized stored content do not crash the composer or bypass its length limit.
- [ ] Existing keyboard, IME, duplicate-submission, and successful/failed send behavior still works.
- [ ] Shared messages continue to use the Redis-backed API; only the private unsent draft uses browser storage.

## Validation

Use Node.js 24 and run `npm ci`, then run `npm run check`. Add focused tests for restore-before-save ordering, success versus failure clearing, identity isolation, and throwing storage methods. Keep the existing composer and identity regressions meaningful.

Manually test refresh, emptying the draft, a failed request followed by refresh, and successful sending followed by refresh. Record command results and explicitly identify any checks not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

- Read and follow `AGENTS.md` and `CONTRIBUTING.md`. Begin with `git status`; protect existing work. Fetch origin and create a fresh branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-draft-recovery`. Do not reuse a merged feature branch.
- Preserve Redis-backed shared message persistence, server-only Redis credentials, and the separate Production/Preview/local `CHAT_ROOM_PREFIX` values. Do not reset history, change the current `CHAT_TITLE` in `src/config/chat.ts`, add paid services, or commit secrets, `.env*`, `.vercel`, dependencies, or build output.
- Keep shared hooks, shared types, and page assembly changes minimal. Review the diff and stage only relevant files when the participant requests a commit.
- Prepare a suggested commit message and PR summary explaining behavior, implementation choices, validation, and remaining limitations. Use the actual GitHub issue number in `Fixes #<actual issue number>`; `CHAT-11` is a catalog ID, not a GitHub issue number. Set PR base to `develop` and follow `CONTRIBUTING.md` for issue status.
- The author must explain the change and another human must review it. AI feedback does not replace human approval. Push, open a PR, or deploy only within the participant's explicit authorization.
