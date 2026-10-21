# Show new messages without interrupting someone reading history

| Field | Value |
| --- | --- |
| Ticket ID | CHAT-12 |
| Difficulty | Advanced |
| Estimate | 45–65 minutes |
| Prerequisites | None; implement against the latest `origin/develop` |
| Primary files | `src/components/chat/MessageList.tsx`, `src/app/globals.css`; page wiring only if needed for an already merged search feature |

## Goal

Let a participant read older messages without being pulled to the bottom, and provide a clear way to see newly arrived messages. Treat this issue body as the implementation brief for Codex or Claude Code.

## Current behavior

`MessageList` scrolls to the bottom whenever the newest message ID changes. A participant reading older messages loses their place when another person sends a message. The hook deduplicates messages by Redis stream ID and caps the loaded list at `MAX_CLIENT_MESSAGES` (currently 300), so a new arrival does not always increase array length.

## Implementation requirements

1. Keep scroll and unread presentation state in `MessageList`. Define “near the bottom” using a small documented threshold, for example 48 pixels from the bottom. Track this from the scroll container; use the position before new content arrives when deciding whether to follow it.
2. Preserve the welcome heading on the first load. Establish an initial message baseline after loading; do not count the initially loaded history as unread or jump merely because the first request completed.
3. If the participant was near the bottom, follow new messages and keep unread count at zero. If they were reading above the threshold, keep their reading position stable when remote messages arrive and reveal a button such as “3 new messages · Jump to latest”.
4. Count newly received, distinct messages from other client IDs only while away from the bottom. Do not count repeated polling results, initial history, a participant's own messages, or array replacements that contain the same IDs. Detect arrivals by message IDs rather than array length so the capped list works.
5. When an accepted message from the current client arrives, follow it to the bottom and clear unread state. Clicking the new-messages button or manually scrolling to the bottom also clears unread state. Observers with no identity should treat received messages as remote.
6. Account for older items being removed by the 300-message cap so the visible reading position does not jump unnecessarily. Use a stable visible message anchor or an equivalent measured adjustment. If the anchor itself has been evicted, preserve the nearest remaining readable position rather than jumping to the newest message.
7. Keep the jump button reachable by keyboard, clearly labeled, and visible on mobile without covering the composer. Announce count changes politely, without announcing the complete message history again. Respect reduced-motion preferences if adding smooth scrolling.
8. If message search has already been merged, coordinate through its existing filter-state API or a small optional prop such as `isFiltered`. Suspend follow/unread presentation during filtering, and establish a fresh baseline when filtering is cleared; showing or hiding old search results must not create unread counts or jumps. Do not implement the search ticket as part of this task.
9. Keep polling, Redis storage, stream ordering, and hook state intact. This is local reading position state, not a server-side read receipt or persistent unread count.

## Acceptance criteria

- [ ] Initial history load leaves the welcome heading visible and shows no unread badge.
- [ ] A remote arrival follows automatically while the participant is at the bottom.
- [ ] A remote arrival while reading above the threshold preserves reading position and increases the unread count once.
- [ ] Duplicate polling data does not increase the count; an own-message arrival does not count as remote unread.
- [ ] The behavior works when a new arrival replaces the oldest entry in a full 300-message list.
- [ ] The jump button and manual scrolling to the bottom both clear unread state.
- [ ] Successful own-message arrival follows the new message and clears unread state.
- [ ] Keyboard and narrow-screen users can reach the jump action without losing access to message composition.
- [ ] If search is present, changing or clearing a query does not manufacture unread arrivals or force a jump.

## Validation

Use Node.js 24 and run `npm ci`, then run `npm run check`. Update the existing unconditional-scroll assertion in `tests/chat.test.tsx` to match the new contract. Add focused tests with controlled scroll measurements for near-bottom following, preserving position, deduplication, own-message behavior, initial baseline, and capped-list arrivals.

Use two browser sessions for a real layout check: scroll one session upward, send several messages from the other, then jump to latest and try a full loaded list. Browser layout validation matters because jsdom does not calculate scrolling geometry. Record command results and explicitly identify any checks not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

- Read and follow `AGENTS.md` and `CONTRIBUTING.md`. Begin with `git status`; protect existing work. Fetch origin and create a fresh branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-unread-messages`. Do not reuse a merged feature branch.
- Preserve Redis-backed shared message persistence, server-only Redis credentials, and the separate Production/Preview/local `CHAT_ROOM_PREFIX` values. Do not reset history, change the current `CHAT_TITLE` in `src/config/chat.ts`, add paid services, or commit secrets, `.env*`, `.vercel`, dependencies, or build output.
- Keep shared hooks, shared types, and page assembly changes minimal. Review the diff and stage only relevant files when the participant requests a commit.
- Prepare a suggested commit message and PR summary explaining behavior, implementation choices, validation, and remaining limitations. Use the actual GitHub issue number in `Fixes #<actual issue number>`; `CHAT-12` is a catalog ID, not a GitHub issue number. Set PR base to `develop` and follow `CONTRIBUTING.md` for issue status.
- The author must explain the change and another human must review it. AI feedback does not replace human approval. Push, open a PR, or deploy only within the participant's explicit authorization.
