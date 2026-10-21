# Show the number of active chat sessions

| Field | Value |
| --- | --- |
| Ticket | CHAT-02 |
| Difficulty | Advanced; backend extension |
| Estimated implementation time | 75–110 minutes; pair work or follow-up beyond the core workshop |
| Prerequisites | None; provides the presence foundation for CHAT-03 |
| Primary files | New `src/server/presence-store.ts`, `src/app/api/presence/route.ts`, `src/hooks/usePresence.ts`, and `src/components/chat/OnlineCount.tsx`; small integration in `src/app/page.tsx`; focused presence tests |

## Goal

Implement this issue in the existing repository. Show a live count such as “3 sessions online” so workshop participants can see how many joined browser sessions are active in their room. A session is active when the server received its heartbeat within the last 60 seconds. These are tab identities, not verified people or accounts.

## Current behavior

`useIdentity` creates a UUID `clientId` and a display name in `sessionStorage`. `useChat` polls messages, and `ChatStats` reports that client's message connection status. Neither establishes whether other sessions are currently present. Existing message authors and the number of fetched messages must not become a presence estimate.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, the named files, and existing API/store/hook tests before editing. Keep presence code in its own files. Add only the props and page wiring needed to render the count. Keep message polling and connection status independent.
2. Add a Node runtime, dynamic, same-origin `/api/presence` endpoint. `PUT` accepts only a valid UUID `clientId` and a trimmed display name of 1–24 characters without control characters. Reuse the identity already established by `useIdentity`; do not generate a second identifier. This self-declared identifier is not authentication and must never be described as verified identity.
3. Use server-only `redisCommand` and the exact existing room-prefix validation and `teamchat:{room}` key format. If necessary, extract only the existing key-prefix helper into a small shared server module. Every presence key must use that prefix and the same Redis Cluster hash slot. Use a last-seen sorted set and bounded member metadata, never process memory, message history, `KEYS`, or a database-wide `SCAN`.
4. Make heartbeat upsert, expiry pruning, and active-count reads atomic with Redis scripting. Use Redis/server time, never a browser-provided timestamp. A last-seen age of 60 seconds or more is expired. Remove expired metadata with its member. Refresh expiry on presence storage so abandoned data cannot remain indefinitely.
5. Store `clientId`, `displayName`, `connectedAt`, and `lastSeenAt` from the start, ready for CHAT-03. `connectedAt` is the first accepted heartbeat in the current active stint; normal heartbeats preserve it, and a heartbeat after expiry creates a new stint. Prefer one consistent millisecond timestamp format throughout the store.
6. Bound the active set to 500 sessions after pruning. Reject a new session beyond that cap with `429` and a useful retry hint; existing active sessions can still refresh. Do not silently drop members or return a deceptively exact partial count. Keep read and cleanup work bounded by the room cap.
7. Successful `GET` and `PUT` return `{ onlineCount, observedAt }`, with a nonnegative integer count and a server timestamp. Use `Cache-Control: no-store`. Apply the current message route's same-origin policy, including its browser `Host` handling, bounded JSON reading, generic `503` errors, and appropriate `400`/`413`/`415` responses. Bound the presence body to 2,048 bytes even without `Content-Length`. Never expose Redis details.
8. Create one `usePresence(identity)` instance in the page. Send a heartbeat immediately after joining while visible, every 20 seconds while visible, and immediately when a hidden tab becomes visible again. Do not heartbeat before joining or while hidden. Read the count immediately and every 10 seconds while visible; visitors may see the count without being counted. Coalesce overlapping requests, use abort/timeouts, and clean up timers/listeners on unmount.
9. Let expired heartbeats remove closed or hidden sessions. A best-effort unload/leave request must not be required for correctness. Tab refresh restores the same existing identity. Two independently opened and joined tabs count separately when they have distinct session IDs; do not change identity semantics as part of this ticket.
10. Render loading, available, and unavailable/stale states honestly. A failed request must not turn the count into zero or retain a stale value labeled current. Provide accessible status text without announcing every heartbeat, and keep the count usable on narrow screens. WebSockets and paid services are unnecessary.

Preserve `CHAT_TITLE`, all existing `CHAT_ROOM_PREFIX` values, message history, existing routes, text-message compatibility, message request limits, append rate limits, deduplication, and retry behavior. Shared state belongs in server-side Redis. Never put credentials in client code, `NEXT_PUBLIC_*`, documentation, or commits. Do not introduce paid APIs/plans, reset a room, or broaden the task into an identity rewrite.

## Acceptance criteria

- [ ] Before joining, a browser does not add itself to the active count.
- [ ] Two separately opened, joined sessions with different IDs produce a count of two in both browsers within 10 seconds of a successful heartbeat; refreshing either does not add another session.
- [ ] A session that sends no heartbeat expires at 60 seconds and disappears on the next successful count refresh; its expiration does not depend on unload events.
- [ ] Heartbeats preserve `connectedAt`, and joining again after expiration creates a newer `connectedAt`.
- [ ] Presence in a test room cannot appear in another room, and no message history or rate-limit key is changed.
- [ ] Redis/network failures display unavailable or explicitly stale presence, preserve message sending, and recover after a successful refresh.
- [ ] Hidden tabs stop presence requests, visible tabs resume immediately, requests do not overlap, and unmount leaves no timers/listeners behind.
- [ ] The room cap, malformed inputs, foreign origins, body cap, and generic errors are covered by meaningful tests.

## Validation

Use Node.js 24 and `npm ci`. Add store/API tests for server timestamps, atomic expiry at the exact 60-second boundary, repeat heartbeats, capacity, room isolation, request validation, and safe failures. Use fake timers and mocked fetch for join/visibility/resume/cleanup behavior. Existing Redis mocks do not execute Lua; document that limitation and, when a configured development Redis is available, smoke-test the actual script in an isolated local prefix without touching Production or Preview.

Run `npm run check` after the change. Manually verify two independent tab identities, expiration after stopping heartbeats, recovery, and a narrow viewport. Record all check results and explicitly identify any checks you could not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Start from a clean working tree and the latest `origin/develop`, following `CONTRIBUTING.md`; create a new participant branch such as `feature/<actual-issue-number>-online-count`. The `CHAT-02` planning ID is not a GitHub issue number. Keep the diff limited to this feature and its tests, and inspect it for secrets or generated/dependency files.

Prepare a suggested commit message and PR description with the change, acceptance criteria, automated/manual validation, and `Fixes #<actual-issue-number>`. Set PR base to `develop`; the develop push workflow handles completed-issue closure after the merge. The human author must explain the implementation and another human must review it; AI feedback does not replace that approval. Pasting this issue authorizes local implementation and validation, not an automatic commit, push, PR creation, merge, or deployment. Perform external actions only when separately authorized.
