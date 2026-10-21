# List active participants with the newest arrivals first

| Field | Value |
| --- | --- |
| Ticket | CHAT-03 |
| Difficulty | Intermediate after the presence foundation |
| Estimated implementation time | 35–55 minutes |
| Prerequisites | CHAT-02 merged into `develop`; replace this reference with its actual GitHub issue link when publishing |
| Primary files | New `src/components/chat/OnlineParticipants.tsx`; the `src/server/presence-store.ts`, `src/app/api/presence/route.ts`, and `src/hooks/usePresence.ts` introduced by CHAT-02; small page/style integration and focused tests |

## Goal

Implement this issue in the existing repository. Add an accessible list of the room's currently active sessions, ordered by most recent arrival. People should be able to see who recently joined, without mistaking an old message author for someone who is online now.

## Current behavior

The original starter stores tab identities in `sessionStorage` and displays message authors. CHAT-02 adds server-side Redis presence, a 60-second activity window, a live count, and one shared `usePresence` instance. This ticket extends that foundation. If it is not yet merged, identify the missing prerequisite and stop implementation rather than inventing a second presence system.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, the merged CHAT-02 implementation, and relevant tests. Build the roster as its own component. Reuse the existing presence endpoint/store/hook and page-level hook instance; do not add a second heartbeat timer, poller, identity, or room keyspace.
2. Extend successful `/api/presence` `GET` and `PUT` responses additively with `participants`. Each record contains exactly the public presence fields needed here: `clientId`, `displayName`, `connectedAt`, and `lastSeenAt`. Preserve `onlineCount` and `observedAt` for existing count consumers. Do not return credentials, IPs, rate keys, session-storage contents, or authentication claims.
3. Return count and list from the same atomic pruned presence snapshot. Include only sessions whose server-recorded last heartbeat is less than 60 seconds old. Keep CHAT-02's bounded 500-member storage/read contract and its explicit capacity behavior; no silent truncation, `KEYS`, global `SCAN`, or message-history inference.
4. Sort by `connectedAt` descending, with ascending `clientId` as a deterministic tie-breaker. Heartbeats update `lastSeenAt` without changing `connectedAt` or list position. A heartbeat after the session expired starts a new stint and moves that session to the top. Validate timestamps and response structure before replacing the client snapshot.
5. Show a concise list headed “Online participants”. Use the display name, a safe text initial fallback, and an accessible “You” label for the current `clientId`. Duplicate display names are allowed; use `clientId` as the React key and never merge rows by name. Describe entries as active sessions, not verified accounts or unique people.
6. Keep the list usable at 320px width. Truncate or wrap long names without hiding their accessible names. A collapse/expand control or independently scrollable region may limit visual height, but must keep all current rows reachable by keyboard. Do not require a mouse, hover, or color alone to understand the list.
7. Define loading, zero participants, and unavailable/stale states. A failed request must not present an empty roster as a confirmed absence or leave stale names labeled current. Keep the shared count and list consistent; an unavailable roster must not keep an apparently authoritative count from an older snapshot.
8. Use the heartbeat and refresh schedule already established by CHAT-02: heartbeat every 20 seconds while visible and immediately on join/resume; snapshot refresh every 10 seconds while visible. Preserve overlap protection, abort/timeouts, cleanup, and no requests from hidden tabs. Do not connect this schedule to the faster message poller.
9. Keep membership expiry server-driven. Closing a tab may take up to 60 seconds plus the next successful refresh to disappear. No unload request, WebSocket server, paid API, avatar/profile feature, or authentication system is required.

Preserve `CHAT_TITLE`, existing `CHAT_ROOM_PREFIX` values, message history, existing routes/contracts, text-message compatibility, request limits, message append rate limits, deduplication, and retry behavior. Shared presence state must remain in server-side Redis under the existing room prefix and Redis Cluster hash slot. Keep common type/hook/page edits small and additive. Never place secrets in client code, `NEXT_PUBLIC_*`, documentation, or commits, and do not add paid services or reset a room.

## Acceptance criteria

- [ ] After Alice joins and Bob joins later, both browsers show Bob above Alice within the next successful refresh.
- [ ] Alice's later heartbeat does not move Alice above Bob; equal arrival timestamps use the documented ID tie-breaker.
- [ ] Two different IDs using the same display name remain two rows, and only the local ID receives “You”.
- [ ] Expired sessions disappear from count and list together; a session returning after expiry receives a new arrival time and appears first.
- [ ] The roster uses presence data exclusively, including sessions that have never sent a message.
- [ ] Loading, true zero, storage failure, recovery, and a stale snapshot have distinguishable accessible states.
- [ ] The roster works by keyboard on a narrow screen, does not leak into another room, and adds no duplicate polling or heartbeat requests.

## Validation

Use Node.js 24 and `npm ci`. Add focused store/API tests for the additive response, one atomic snapshot, exact expiry boundary, stable arrival order across heartbeats, deterministic ties, rejoining, room isolation, and invalid storage responses. Add component/hook tests for duplicate names, “You”, empty/loading/unavailable states, and reuse of the existing presence schedule.

Run `npm run check`. In two independently opened tabs with distinct joined identities, verify arrival order, refresh stability, expiration, rejoining, and keyboard access at 320px width. If a development Redis is available, test the real atomic presence script only in an isolated local room prefix; mocks alone do not prove Lua behavior. Report every executed check and explicitly name any check you could not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Start with a clean working tree and the latest `origin/develop` after CHAT-02 merges. Follow `CONTRIBUTING.md` and create a new participant branch such as `feature/<actual-issue-number>-online-participants`. Planning IDs such as `CHAT-03` are not GitHub issue numbers. Coordinate with the CHAT-02 author if the store contract differs; extend the merged contract rather than duplicating it.

Prepare a suggested commit message and PR description covering behavior, the prerequisite, acceptance criteria, validation, and `Fixes #<actual-issue-number>`. Use PR base `develop`; the develop push workflow handles completed-issue closure after the merge. The human author explains the changes and another human reviews them; AI feedback cannot supply human approval. Pasting this issue authorizes local implementation and validation, not an automatic commit, push, PR creation, merge, or deployment. External actions require separate authorization.
