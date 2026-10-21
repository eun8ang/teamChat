# Add shared emoji reactions to messages

| Field | Value |
| --- | --- |
| Ticket | CHAT-09 |
| Difficulty | Advanced; backend extension |
| Estimated implementation time | 90–140 minutes; follow-up or pair work beyond the core workshop |
| Prerequisites | None; independent of the composer emoji picker |
| Primary files | New `src/components/chat/MessageReactions.tsx`, `src/hooks/useReactions.ts`, `src/server/reaction-store.ts`, `src/app/api/reactions/route.ts`, and `src/app/api/messages/[messageId]/reactions/route.ts`; small message-list/bubble/page integration and focused tests |

## Goal

Implement this issue in the existing repository. Let joined sessions add or remove a small set of emoji reactions on a message, and show the same counts to everyone in that room.

## Current behavior

`MessageBubble` renders plain text. `useChat` merges messages from an append-only Redis Stream and only requests IDs after its last cursor. A reaction to an older message will never arrive through that stream cursor. Local component state alone cannot make reactions shared or persistent.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, existing message/store/API/hook code, and tests. Keep reaction data and polling in dedicated feature files. Add only the message props and page wiring needed; preserve the stream's append-only contract.
2. Support this fixed allowlist: 👍, ❤️, 😂, 🎉, 😮, and 👀. Each tab's existing UUID `clientId` may have at most one active reaction for each allowed emoji on each message. A session may use multiple emoji. This identifier is self-declared, not an authenticated user or a guarantee of one vote per person.
3. Add `PUT /api/messages/[messageId]/reactions` with `{ clientId, emoji, active }`, where `active` must be a boolean. Validate message IDs with the existing strict Redis Stream ID validator, UUIDs with the existing identity rules, and emoji by exact allowlist membership. Use an idempotent desired state: repeated `active: true` requests never toggle off or double-count, and repeated `false` requests are safe.
4. In one atomic Redis operation, verify that the target message is still retained in this room and apply the requested set membership. Reject a valid but missing/trimmed message with `404`; malformed input uses `400`. Never perform a separate read-check-write that can race trimming. Store shared reactions only in server-side Redis, with the exact existing room prefix/hash slot. Cap each message/emoji set at 500 client IDs; reject a new member beyond the cap with `429`, but still permit removals and no-op retries. Read counts/membership without returning or enumerating the full client set.
5. Put expiry on side data, no longer than the existing 24-hour room lifetime, and refresh it appropriately after successful changes. Ensure reactions attached to trimmed or expired messages cannot be returned or resurrected; expired side keys are eventually reclaimed. Avoid unbounded collection reads, database-wide scans, or rewriting message history to add a reaction.
6. Add a bounded snapshot endpoint `GET /api/reactions?messageIds=<comma-separated-ids>&clientId=<optional-uuid>`. Accept 1–100 unique validated message IDs per request. `clientId` is optional for visitors; validate its UUID format when supplied, and never generate another identity just to read reactions. Return only counts and whether the requesting tab selected each allowed emoji, keyed by message ID; anonymous reads return `selected: false` and do not query per-client membership. Do not expose other client IDs. Read retained-target status, counts, and selection consistently through a bounded atomic Redis snapshot. Treat trimmed messages as absent and disable their reaction controls instead of presenting unavailable counts as zero. Return explicit zero counts for retained messages when needed to remove stale chips.
7. Add one feature hook that refreshes the loaded message IDs immediately and every 10 seconds while visible, splitting at most 300 loaded IDs into batches of at most 100. Refetch immediately on visibility resume and after a successful mutation. Pause hidden tabs, protect against overlapping/stale requests, use timeouts/abort, and clean up. Do not infer reaction updates from `GET /api/messages?after=...` or advance its cursor.
8. Use the current route's same-origin/Host policy, Node runtime, dynamic/no-store responses, bounded JSON reading, and generic safe `503` errors. Cap mutation bodies at 2,048 bytes even without `Content-Length`. Add a separate room-prefixed atomic reaction rate limit of 30 state changes per client per 10 seconds, returning `429` with `Retry-After`; no-op idempotent retries should not consume a state-change allowance. Preserve the existing message rate limits unchanged.
9. Extract a small shared server helper only if needed to reuse existing prefix/origin/body handling; keep behavior and tests compatible. Use a stable key order for batched responses, reject oversized snapshot inputs before storage, and do not let client-supplied IDs access other room keys.
10. Render a keyboard-accessible reaction menu and chips with accessible labels such as “Thumbs up, 2 reactions”, counts, and `aria-pressed` for the local choice. Prevent duplicate in-flight changes for the same control. Visitors may read counts, but only joined sessions can react. Do not confuse reaction emoji with the composer insertion picker.
11. On failed changes preserve the confirmed state and show a useful retry message. If using optimistic rendering, roll it back and reconcile safely. Mark snapshot failures unavailable or stale rather than resetting counts to zero. Reactions must not scroll the chat to its bottom, modify a draft, or block message sending.

Preserve `CHAT_TITLE`, every existing `CHAT_ROOM_PREFIX`, room history, existing routes, text-message compatibility, the 16,384-byte message body cap, message rate limits, append deduplication, and retry behavior. Keep common type/hook/page edits small. Never add paid services, put credentials in client code or `NEXT_PUBLIC_*`, commit secrets, or reset a room.

## Acceptance criteria

- [ ] In two joined sessions, adding/removing reactions updates the other session within the next successful 10-second refresh, including reactions to an older loaded message.
- [ ] Repeating the same desired-state request, including a retry after a lost response, cannot double-count or invert the selection.
- [ ] Concurrent additions from two IDs produce two reactions; removing one leaves the other intact.
- [ ] A visitor without an identity can read shared counts with every selection false; reading creates no identity or reaction membership, and a malformed supplied ID is rejected.
- [ ] Reactions remain after refresh, stay isolated by room, and do not appear on missing/trimmed messages.
- [ ] Old messages without reaction state still render; the existing message stream/cursor, send retries, and message rate limits behave as before.
- [ ] Invalid emoji/IDs, non-boolean state, oversized bodies/batches, foreign origins, rate limits, and storage failure produce appropriate safe errors.
- [ ] Keyboard users can select and remove reactions; hidden tabs stop polling and unmount cleans up; failures do not manufacture zero counts.

## Validation

Use Node.js 24 and `npm ci`. Add store/API tests for idempotent desired state, concurrent members, atomic target validation/snapshots, anonymous counts without membership lookups, optional-ID validation, expiry, room isolation, exact input bounds, separate rate limits, and generic failures. Add hook/component tests for visitor reads without a generated identity, old-message polling, batching, hidden/resume/cleanup, accessible pressed states, failed mutation recovery, and stale response handling.

Run `npm run check`. Smoke-test the real Lua behavior with two independent joined sessions and an isolated development Redis prefix when configured; mocked `redisCommand` tests do not execute Lua. Verify reaction changes without new messages, page refresh, a disappearing target, mobile layout, and uninterrupted typing/sending. Record all results and explicitly list checks you could not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Follow `CONTRIBUTING.md`: begin with a clean tree and the latest `origin/develop`, then create a new participant branch such as `feature/<actual-issue-number>-message-reactions`. `CHAT-09` is a planning ID, not an actual GitHub issue number. Coordinate small bubble/list integration with other message-feature authors and avoid broad refactoring.

Prepare a suggested commit message and PR body containing behavior, acceptance criteria, validation, and `Fixes #<actual-issue-number>`, with PR base `develop`. The develop push workflow handles completed-issue closure after the merge. The author must explain the change and another human must review it; AI feedback is not human approval. Pasting this issue authorizes local implementation and validation, not an automatic commit, push, PR creation, merge, or deployment. External actions require separate authorization.
