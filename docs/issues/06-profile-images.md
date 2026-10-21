# Let participants upload and change their profile image

- Ticket: `CHAT-06`
- Difficulty: Advanced
- Estimate: 90–150 minutes after `CHAT-04`
- Dependencies: `CHAT-04` must be merged into `develop` first; reuse its bounded upload/media API
- Main files: new `src/components/chat/ProfileImageEditor.tsx`, `ParticipantAvatar.tsx`, `ProfileProvider.tsx`, `src/hooks/useProfiles.ts`, `src/server/profile-store.ts`, and `src/app/api/profiles/route.ts`
- Small integration changes: `src/components/chat/MessageBubble.tsx`, `src/app/page.tsx`, and feature styles

## Goal

Implement this issue in the existing repository. Let a participant upload, replace, or reset their profile image. Show the current image beside their messages and in their own sidebar profile, and synchronize changes with other participants in the same room.

## Current behavior

`useIdentity` stores a temporary `clientId` and `displayName` in per-tab `sessionStorage`. There is no account authentication. `MessageBubble` and the sidebar show the first letter of the display name. Chat messages are append-only, so changing a profile should not edit past message records.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, the files above, `src/hooks/useIdentity.ts`, and the merged `CHAT-04` media API/tests. Use the implemented upload response and media URL; do not create a second upload service. If `CHAT-04` is not on the branch, report the unmet dependency instead of building a competing API.
2. Add an “Edit profile image” button next to the joined participant's sidebar profile. Open a labeled editor with the current avatar, a local file picker, preview, “Save image”, “Remove image”, and “Cancel”. Reuse the PNG/JPEG/WebP **100 KiB** file limit and validation from `CHAT-04`. The participant must be able to upload an actual local image; preset icons alone do not meet this issue.
3. Show a temporary preview before saving. Cancel must leave the saved profile unchanged. Save uploads the file and then assigns the returned media ID to the current `clientId`. Reuse a successful upload when assignment fails and the participant retries. A failed upload or save must preserve the previous avatar and selection, with a readable error. Revoke local object URLs after replacement, cancellation, or unmount.
4. Add a room-scoped Redis profile map keyed by valid `clientId`; store the media ID and server-generated update/expiry metadata through `redisCommand`. Validate that an assigned image exists in the same room and was uploaded by the submitted `clientId`. Obtain MIME/expiry from the media store, not client input. A profile assignment must not extend the image's fixed 24-hour lifetime; expire profile state no later than the image. Reset deletes only the profile pointer, leaving the media's existing TTL intact.
5. Expose small bounded `PUT /api/profiles` and `DELETE /api/profiles` requests for save and reset. Provide `GET /api/profiles?clientIds=...` for batches of at most 100 unique, validated client UUIDs. Return a map of available profiles and explicit absence for requested IDs with no active profile, so reset removes stale client state. Never let a request choose the room prefix, Redis key, arbitrary image URL, or another storage backend.
6. Use the existing messages route as a reference for same-origin checks, bounded body reads even without `Content-Length`, `Cache-Control: no-store`, safe Redis-failure errors, and write rate limits. Add a small server-side per-client profile-write limit, for example 10 accepted writes per minute, with `429` and `Retry-After`. Bound query length before parsing. Return `400` for invalid IDs, `404` for absent/expired assigned media, and `503` for unavailable shared storage. Do not expose raw Redis errors or credentials.
7. Keep profiles separate from `ChatIdentity` and historical message payloads. Add a small provider/hook that retrieves profiles for the current participant and distinct authors in loaded messages, splitting requests into batches of 100 if necessary. Fetch one shared map per batch rather than one request for every message avatar. Poll about every 5 seconds while visible, refresh on visibility return, prevent overlapping cycles, abort pending work and clear timers on unmount, and expose a retryable error in the editor.
8. On successful save/reset, update the provider immediately, then let polling reconcile. Guard against an older in-flight GET overwriting that result. Other participants should see the change within the next profile polling cycle. Do not depend on the append-only message cursor to refresh an existing author's avatar.
9. Replace the letter-only rendering with `ParticipantAvatar`, using the shared profile map. Display the current profile beside **all loaded messages** from that client, including earlier messages, without rewriting those messages. Preserve author labels, timestamps, own-message classes, and image/video attachments from other tickets. On expiry or image-load failure, fall back to the existing initial. Keep image dimensions fixed to avoid layout jumps.
10. Give controls keyboard access, clear focus behavior, disabled/busy states, and announced save/error results. An avatar alongside an already visible author name can use empty image alt text; the editor needs an understandable preview label. Explain the 24-hour image expiry. State in technical notes that temporary client IDs are not authenticated accounts; do not describe this as secure account ownership or introduce authentication in this ticket.
11. Add focused tests for assignment validation, room isolation, reset and expiry, file/save failure preservation, polling cleanup, stale-response handling, and initial fallback. Reuse media validation tests rather than copying the upload implementation or changing the message contract.

## Acceptance criteria

- [ ] A participant uploads a local image, saves it, and sees it in the sidebar and beside their messages.
- [ ] A second session in the same room sees save, replacement, and reset within about 5 seconds while visible.
- [ ] Reload restores the profile for the same tab identity; another `CHAT_ROOM_PREFIX` cannot read or assign it.
- [ ] Cancel and failed saves preserve the previously saved avatar; retries reuse an already uploaded file.
- [ ] Reset, expiry, and failed image loads show the participant's initial without breaking message layout.
- [ ] Profile changes update earlier loaded messages without editing stored chat history or waiting for a new message.
- [ ] Multiple messages from one author share the profile fetch; polling pauses while hidden and cleans up on unmount.
- [ ] The editor works with a keyboard and on a 375px-wide viewport.

## Validation

Use Node.js 24 and `npm ci`, then run `npm run check`. With two sessions sharing a disposable development room, verify upload, replace, cancel, reset, refresh, a rejected file, and unavailable-storage behavior. Confirm an expired/missing media response falls back to an initial and check that profile edits do not issue message writes. Verify real Redis persistence and TTL when workshop credentials are available, and record any checks not run. Keep all test files and keys out of production history.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Follow `AGENTS.md` and `CONTRIBUTING.md`. Start with `git status`, preserve unrelated changes, fetch `origin`, and create a feature branch from the latest `origin/develop` after `CHAT-04` is merged, for example `feature/<actual-issue-number>-profile-images`. Keep shared type/hook/page changes minimal; use the feature provider and components. Leave `CHAT_TITLE` in `src/config/chat.ts` unchanged. Preserve message history, Production/Preview/personal-local `CHAT_ROOM_PREFIX` separation, and server-only Redis credentials. Add no paid plans/APIs or new storage account. Never commit secrets, `.env*`, `.vercel`, dependencies, or build output.

Prepare a focused commit message and PR title/body describing behavior, the `CHAT-04` dependency, and validation results, with `Fixes #<actual GitHub issue number>`; `CHAT-06` is a planning ID. The PR base must be `develop`. The author must explain the implementation and another human must review and approve it; AI feedback cannot replace human approval. Pasting this issue authorizes local implementation and validation only. Do not automatically commit, push, open a PR, publish, merge, or close the issue unless separately instructed. Follow the facilitator's release process; issue closure after integration is handled by the develop push workflow.
