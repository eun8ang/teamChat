# Reply to a message with a quoted preview

| Field | Value |
| --- | --- |
| Ticket | CHAT-10 |
| Difficulty | Advanced; additive message-contract extension |
| Estimated implementation time | 90–130 minutes; follow-up or pair work beyond the core workshop |
| Prerequisites | None; coordinate shared message files with attachment authors |
| Primary files | New `src/components/chat/ReplyPreview.tsx`; focused changes in `MessageBubble.tsx`, `MessageList.tsx`, `MessageComposer.tsx`, `useChat.ts`, `src/types/chat.ts`, `src/app/api/messages/route.ts`, and `src/server/chat-store.ts`; minimal page wiring and focused tests |

## Goal

Implement this issue in the existing repository. Let a participant select “Reply” on a message and send a new text message with a small, durable quotation of its original author and text. This is a flat conversation with reply previews; nested threads, editing, and deletion are outside this ticket.

## Current behavior

`MessageComposer` sends a string through `useChat`. The API accepts `clientId`, `clientMessageId`, `displayName`, and `content`; Redis stores plain text messages. The append script handles deduplication, both rate limits, exact trimming to 500 messages, and expiry atomically. Existing messages have no reply metadata.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, the current message/composer/hook/API/store code, and tests. Keep preview presentation in its own component. Make shared contract and page changes small and additive; preserve ordinary text sends and old stored messages.
2. Add an optional request field `replyToId`. When present it must be a string in the exact canonical Redis Stream ID form accepted by `isValidCursor`; reject whitespace-padded/noncanonical IDs rather than changing their meaning. Omitted means a normal message. Reject malformed types and do not accept a client-provided author or excerpt as authoritative metadata.
3. Add optional response/stored metadata `replyTo: { id, displayName, excerpt }`. Resolve it on the server from the retained original in the same room. Bound the excerpt to 160 Unicode code points, preserve readable text, and render it as text. Do not copy nested reply metadata or trust a claimed client snapshot. Keep the normal nonempty text-content requirement and 1,000-character limit unchanged.
4. Verify target retention as part of the atomic append operation, before creating a new message or consuming its message rate allowance. If a syntactically valid target is absent/trimmed, return `409` with a clear “original message is no longer available” error and preserve the reply selection and draft. A server-side pre-read may prepare the bounded excerpt from an immutable message, but the append script must recheck target existence before writing so trimming cannot race the send.
5. Preserve deduplication as the first operation for retries. A successful send retried after its original target later disappears must still return the first stored message, ID, timestamp, and snapshot. Include the normalized `replyToId` in the request fingerprint; reusing a `clientMessageId` for a different reply target must produce the existing conflict response. If image attachments are already merged, retain their attachment ID/description in that fingerprint as well. Ordinary sends with no target retain their existing behavior.
6. Store/parse the optional bounded snapshot in both stream entries and dedupe records, and return it through initial history, incremental reads, and POST responses. Legacy entries without it remain valid. Once created, the quote remains readable even if the original later falls outside the client's loaded window or is trimmed from Redis. Do not reread the original just to render an existing snapshot.
7. Keep the existing JSON request cap at 16,384 bytes, including optional fields, and preserve strict streamed-body enforcement without `Content-Length`. Keep the UUID, trimmed 1–24-character name/no-control, trimmed 1–1,000-character content, same-origin/Host, JSON content-type, no-store, rate-limit/`Retry-After`, and safe storage-error behavior. Do not weaken unrelated validation to fit metadata.
8. Show a keyboard-accessible “Reply” action for joined sessions on each message. Selecting it shows the original author's name and bounded excerpt above the composer and focuses the textarea. Add an accessible “Cancel reply” button. Changing/canceling the selection preserves the current text draft. Visitors can read reply previews without gaining a send action.
9. Send only the target ID alongside the normal payload. Clear both draft and selection only after confirmed server success; failure keeps both available to retry or cancel. Existing Enter, Shift+Enter, Korean/IME composition, send-busy, and focus behavior must remain intact.
10. Include `replyToId` in `useChat`'s pending-submission identity, alongside normalized content and client ID. A timeout retry with the same text and target reuses the same `clientMessageId`; changing or canceling the target creates a new one. If image attachments are already merged, preserve their attachment ID/description in this comparison, so changing an attachment also creates a new submission ID. Only GET may advance the stream cursor, and stale GET responses must not drop a successfully sent reply.
11. Render the stored quote above the reply's own text with a clear semantic relationship, sufficient contrast, and safe wrapping at 320px width. Display a readable fallback for an empty/unsupported original representation if other message types have already merged; do not require attachment implementation or embed raw HTML. Keep the flat chronological message list and its existing ordering.

Preserve `CHAT_TITLE`, all existing `CHAT_ROOM_PREFIX` values, room history, existing routes and response fields, plain-text compatibility, message rate limits, exact retention, expiry, and idempotent retries. All shared messages and metadata must remain in server-only Redis with the current room prefix/hash slot. Never use browser/process memory as shared storage, put secrets in client code or `NEXT_PUBLIC_*`, commit credentials, add paid services, or reset a room.

## Acceptance criteria

- [ ] Selecting Reply opens a composer preview; changing or canceling the target preserves typed text and supports keyboard use.
- [ ] Sending creates one normal chronological message with an accurate server-authored quote, visible in a second session and after refresh.
- [ ] The client cannot forge the quote author/excerpt; missing or trimmed targets fail before a new append and leave the draft and selection intact.
- [ ] Reply metadata remains readable after the original is trimmed, while old messages without metadata continue to load.
- [ ] Retrying the same successful request returns the original reply even if its target has since expired; changing targets under the same ID conflicts.
- [ ] A timed-out send keeps its draft/target and reuses its ID only when both remain unchanged; POST does not advance the read cursor.
- [ ] Normal text, Unicode excerpts, body/content bounds, rate limits, IME Enter behavior, safe failures, room isolation, and mobile layout still work.

## Validation

Use Node.js 24 and `npm ci`. Extend existing store/API tests for legacy entries, snapshot round-tripping, invalid target types/IDs, forged snapshots, missing/trimmed targets, Unicode excerpt bounds, atomic target validation, dedupe ordering, differing-target conflicts, exact body cap, and unchanged normal sends/rates. Extend hook/composer tests for target changes, cancellation, preservation on failure, retry IDs, keyboard/IME behavior, and stale GET races.

Run `npm run check`. In two joined sessions, verify reply creation, refresh, an original outside the local loaded list, missing-target recovery, and keyboard/mobile behavior. When configured, smoke-test the actual append Lua against an isolated development Redis prefix; existing mocks do not execute Lua. Never trim or reset Production/Preview to manufacture a test. Record all results and explicitly name checks you could not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Follow `CONTRIBUTING.md`: begin with a clean tree and the latest `origin/develop`, then create a new participant branch such as `feature/<actual-issue-number>-message-replies`. `CHAT-10` is a planning ID, not a GitHub issue number. Coordinate the additive payload/fingerprint change with other authors working on `useChat`, message types, the route, or the append script.

Prepare a suggested commit message and PR body covering behavior, compatibility, acceptance criteria, validation, and `Fixes #<actual-issue-number>`. Use PR base `develop`; the develop push workflow handles completed-issue closure after the merge. The author must explain the implementation and another human must review it; AI feedback is not human approval. Pasting this issue authorizes local implementation and validation, not an automatic commit, push, PR creation, merge, or deployment. External actions require separate authorization.
