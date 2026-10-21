# Create shared polls and vote from the chat room

- Ticket: `CHAT-07`
- Difficulty: Advanced; suitable for an experienced pair or a follow-up session
- Estimate: 120–180 minutes
- Dependencies: None; implement as a separate feature panel
- Main files: new `src/components/chat/PollsPanel.tsx`, `PollComposer.tsx`, `PollCard.tsx`, `src/hooks/usePolls.ts`, `src/types/poll.ts`, `src/server/poll-store.ts`, `src/app/api/polls/route.ts`, and `src/app/api/polls/[id]/vote/route.ts`
- Small integration changes: `src/app/page.tsx` and feature styles

## Goal

Implement this issue in the existing repository. Let participants create a multiple-choice poll, choose one answer, change that answer, and see shared results update. Polls should survive refresh and be visible to everyone in the same room.

## Current behavior

The application shares append-only text messages through a Redis stream. There is no poll UI or vote storage. `useChat` fetches only messages newer than its cursor; it cannot discover changed counts on an existing poll. Build a dedicated polls panel with its own Redis data, routes, and synchronization instead of modifying the chat message union or cursor logic.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, `src/server/redis.ts`, `src/server/chat-store.ts`, `src/app/api/messages/route.ts`, `src/hooks/useChat.ts`, `src/hooks/useIdentity.ts`, and the relevant tests before editing. Reuse the Redis transport and conventions. Keep poll types, state, and API logic in the feature's own files.
2. Add a collapsible “Room polls” panel with a create form and newest-first poll cards. Participants must join with a display name before creating or voting; unjoined visitors may read results. Keep ordinary chat usable while the panel is open and on mobile. One small page integration is sufficient; do not send synthetic text messages for poll updates.
3. A poll has a nonempty question of at most **160 characters**, **2–6** nonempty options of at most **80 characters** each, creator `clientId` and display name, server-generated opaque poll/option IDs, creation time, and expiry time. Trim input; reject duplicate options after case-insensitive normalization. Apply the existing client-ID/name validation conventions on the server, not only in the form.
4. Support `POST /api/polls` with a stable `clientPollId` UUID for retries and `GET /api/polls` for a bounded current snapshot. The snapshot returns at most **20 active polls**, aggregate counts, total voters, and only the requesting client's selected option when a valid optional `clientId` is supplied. Do not return the voter list or other participants' client IDs. Creating a 21st active poll must give a readable capacity error, not silently remove existing polls.
5. Store shared poll data and vote selections in separate Redis keys using the same validated `teamchat:{room}` prefix as messages. Keep EVAL keys in the same Redis Cluster hash slot. Use a room index with expiry scores to discover active polls; prune expired members when accessing it. Give each poll and its votes a **fixed 24-hour TTL from creation**. Reading, retrying, or voting must not extend expiry. All rate-limit and creation-dedupe keys must also have bounded TTLs.
6. Create each poll atomically with the active-poll capacity check, rate limit, and dedupe record. The same client and `clientPollId` with the same normalized question/options must return the original poll, without creating or counting twice. Reuse with different content returns `409`. Allow at most **2 successful poll creations per client per minute** and report `429` with `Retry-After` for that rate limit. Keep the draft on failure and preserve the request ID for unchanged retries.
7. Support `PUT /api/polls/[id]/vote` with `{ clientId, optionId }`. This means **set my selection to this option**, not “toggle” or “increment”. In one atomic Redis operation, verify an unexpired poll and valid option, inspect the previous selection, decrement its count if it changes, increment the selected option once, and store the new selection. Repeating the same request is a no-op for totals. Two different clients voting at once must not lose votes. One client changing answers still counts as one voter.
8. Limit each poll to **200 distinct client IDs** to bound workshop storage; existing voters may still change their selection at capacity. Rate-limit vote writes to **20 per client per minute**, returning a readable retry time. Keep counts nonnegative and consistent with selections. Missing/expired polls return `404`; invalid options return `400`. Disable overlapping submissions for one client's poll card and preserve the desired option if a request fails, so retries remain understandable.
9. Mirror the message route's same-origin checks, including browser `Host` handling. Accept only JSON for writes and enforce a **4 KiB body limit while streaming**, including requests without `Content-Length`. Validate poll IDs and optional query client IDs, use `Cache-Control: no-store`, and return safe errors for invalid requests, rate limits, capacity, and Redis unavailability. Never use the browser to select a Redis room/key or send Redis credentials to the client.
10. Add `usePolls` with a snapshot fetch when the panel opens and about every **5 seconds** while open and visible. Refresh on visibility return; prevent overlapping reads, cancel/abort pending requests on close or unmount, clear timers, and provide a retry action. Apply successful create/vote responses immediately. Guard against an older in-flight snapshot overwriting a successful local mutation. Do not rely on the append-only message cursor for vote updates.
11. Use a labeled question field, option inputs, keyboard-accessible add/remove controls, and a radio group per poll. Show counts, total voters, and percentages, including a clear zero-vote state without division by zero. For nonzero totals, base percentages on `count / total`; harmless display-rounding differences do not require forcing a sum of exactly 100. Announce submission errors and success without repeatedly announcing the entire results panel on every poll.
12. Explain that each temporary browser `clientId` has one active selection and that polls expire after 24 hours. This repository has no authenticated accounts: do not claim verified one-person-one-vote or abuse-proof ownership. Leave closing, deletion, anonymity settings, voter lists, and authentication outside this ticket.
13. Add meaningful store/API tests for bounds, atomic create/vote semantics, retries, answer changes, concurrent different voters, room isolation, capacity, and fixed expiry, plus UI/hook tests for failed drafts and synchronization cleanup. Mocked Redis command tests can verify the boundary and arguments; clearly distinguish these from executing the Lua scripts against real Redis.

## Acceptance criteria

- [ ] A joined participant creates a valid poll and a second session sees it within about 5 seconds while the panel is open.
- [ ] Two clients can vote concurrently; one selected answer per client contributes to consistent shared counts.
- [ ] Retrying a create or vote does not create a duplicate poll or inflate a count.
- [ ] Changing an answer decrements the old option and increments the new one without increasing total voters.
- [ ] Invalid/duplicate options, oversized requests without `Content-Length`, unknown options, and expired polls are rejected safely.
- [ ] Server limits bound creation frequency, vote frequency, active polls, and distinct voters; capacity failures are visible.
- [ ] Reload preserves active polls/results in the same room, and another room prefix has separate polls.
- [ ] Results update without a new chat message; polling pauses while hidden/closed and cleans up on unmount.
- [ ] Zero-vote results, failures, keyboard navigation, and a 375px-wide viewport are handled clearly.
- [ ] Existing chat sending, text history, cursor behavior, and other feature attachments remain unchanged.

## Validation

Use Node.js 24 and `npm ci`, then run `npm run check`. Use two sessions in the same disposable development room to create, reload, vote simultaneously, change an answer, and retry a simulated failed request. Verify closed/hidden-panel polling, keyboard controls, zero-vote results, and narrow-screen layout. With workshop Redis available, run a real create/retry/concurrent-vote/answer-change smoke check and verify TTL behavior using disposable room data. Do not claim concurrency or Lua correctness from mocked command tests alone. Record every required check not run and its reason; never reset production keys for validation.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Follow `AGENTS.md` and `CONTRIBUTING.md`. Start with `git status`, preserve unrelated changes, fetch `origin`, and create a feature branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-shared-polls`. Keep shared types/hooks/page changes minimal and leave `CHAT_TITLE` in `src/config/chat.ts` unchanged. Preserve message history, Production/Preview/personal-local `CHAT_ROOM_PREFIX` separation, and server-only Redis credentials. Add no paid plans/APIs. Never commit secrets, `.env*`, `.vercel`, dependencies, or build output.

Prepare a focused commit message and PR title/body describing behavior, bounded workshop limits, and validation results, with `Fixes #<actual GitHub issue number>`; `CHAT-07` is a planning ID. The PR base must be `develop`. The author must explain the implementation, and another human must review and approve it; AI feedback is not human approval. Pasting this issue authorizes local implementation and validation only. Do not automatically commit, push, open a PR, publish, merge, or close the issue unless separately instructed. Follow the facilitator's release process; issue closure after integration is handled by the develop push workflow.
