# Attach a small image to a chat message

- Ticket: `CHAT-04`
- Difficulty: Advanced; suitable for an experienced pair or a follow-up session
- Estimate: 120–180 minutes
- Dependencies: None. `CHAT-06` reuses the upload and media-reading API built here.
- Main files: new `src/components/chat/ImageAttachmentPicker.tsx`, `MessageAttachment.tsx`, `src/server/media-store.ts`, `src/app/api/media/route.ts`, and `src/app/api/media/[id]/route.ts`
- Small integration changes: `MessageComposer.tsx`, `MessageBubble.tsx`, `src/hooks/useChat.ts`, `src/types/chat.ts`, `src/server/chat-store.ts`, `src/app/api/messages/route.ts`, `src/app/page.tsx`, and feature styles

## Goal

Implement this issue in the existing repository. Let a participant select one small image from their computer, write a caption and image description, and send it to the shared room. Everyone should see the image after refresh. Keep this a bounded workshop feature using the existing Redis connection; no additional storage account is required.

## Current behavior

`MessageComposer` sends text through `useChat`. `ChatMessage` contains text, author, ID, and timestamp only. `chat-store.ts` persists an append-only Redis stream with atomic deduplication and rate limits. The messages route limits the whole JSON request to 16,384 bytes. Historical messages must remain readable without migration.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, the files above, and the existing message API/store/component tests before editing. Build the media-specific code in the new files; keep shared changes limited to passing optional attachment metadata.
2. Add a labeled file input supporting one PNG, JPEG, or WebP file up to **100 KiB (102,400 bytes)**. Require the existing nonempty text caption, still limited to 1,000 characters, and a nonempty image description of at most 160 characters. Show a local preview, the size limit, remove action, uploading state, and readable errors. Revoke preview object URLs when replaced or unmounted. Reject SVG, GIF, multiple files, and oversized files.
3. Implement `POST /api/media` using bounded multipart input containing `file` and a valid `clientId`. Enforce an overall **150 KiB request limit while reading the body**, even without `Content-Length`, before parsing multipart data. Validate the actual byte count, declared MIME type, matching PNG/JPEG/WebP format headers, and enough structure to reject truncated or obviously malformed input. Do not trust the extension or filename. Return safe `400`, `413`, `415`, `429`, and `503` errors as appropriate; mirror the message route's same-origin checks, including its handling of `Host`.
4. Generate the opaque media ID on the server. Store base64 image bytes and small metadata in a **separate Redis media key**, scoped by the same validated `teamchat:{room}` prefix as messages. Use `redisCommand`; do not persist uploads in the filesystem, server-instance memory, or browser storage. Store owner `clientId`, trusted MIME type, byte length, and a server-generated `expiresAt`. Return `{ id, mimeType, byteLength, expiresAt }`; expose no Redis keys or credentials.
5. Give every image a **fixed 24-hour TTL from upload**, including uploads never sent. Reading or attaching an image must not renew its TTL. Keep uploads bounded with an atomic limit of 50 unexpired media items per room and 5 successful uploads per client per minute; return `429` with `Retry-After` when applicable. A room-scoped expiry index can remove expired entries before counting. Keep keys in the same Redis Cluster hash slot. An upload failure or limit rejection must not leave a reserved slot behind. This API will also support profile images in `CHAT-06`.
6. Implement `GET /api/media/[id]` to read the current room's media only. Validate the ID; return binary bytes with the stored, allowlisted MIME type, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store`. Return `404` for missing or expired images and a safe `503` for Redis failure. Do not accept arbitrary URLs, paths, Redis keys, or client-supplied content types.
7. Extend messages with **optional** attachment metadata, such as `{ id, alt, expiresAt }`. Keep image bytes out of message POSTs, stream entries, dedupe records, and history responses. The server must validate attachment IDs, description length, and that an unexpired upload belongs to the submitted `clientId` before first publication. The browser's temporary ID is a workshop convention, not authenticated ownership. Obtain the expiry from stored media rather than trusting the browser.
8. Update stream serialization/parsing and message fingerprints to include the optional attachment ID and description. Preserve the existing atomic deduplication, message rate limits, cursor behavior, retention, and legacy text parsing. Exact retries must return the original message; a reused message ID with changed attachment metadata must return `409`. Preserve the dedupe-first behavior so an already accepted retry can still return its original record after the image expires.
9. Upload only when the participant sends the caption, then post the small metadata. Keep the caption, description, and selected file if upload or message submission fails. Reuse a successful upload and the same `clientMessageId` for an unchanged message retry; do not upload a second copy after a message POST times out. Changed drafts must get the appropriate new message ID. Do not raise the existing messages route's body limit to carry binary data.
10. Render the caption and a responsive, lazy-loaded image through the same-origin media URL. Use the supplied description as `alt`, preserve the message's author/time, and constrain dimensions to prevent mobile overflow. Show “Image expired or unavailable” on a missing or failed image without hiding its caption. Explain in the picker that images expire 24 hours after upload. Do not change message history TTL or promise permanent images.
11. Add targeted tests for upload validation and limits, room isolation and fixed TTL, metadata round trips, legacy text messages, dedupe with attachments, retry preservation, and the unavailable-image fallback. Keep tests offline using mocked Redis/fetch responses. Do not claim a mocked command test executes Redis Lua; identify a real Redis smoke check separately.

## Acceptance criteria

- [ ] Two browser sessions in the same room see a captioned image; refreshing preserves the message and available image.
- [ ] A text-only message and an old stream entry without attachment fields still behave exactly as before.
- [ ] Invalid type/signature, an oversized request without `Content-Length`, and an empty description are rejected before publication.
- [ ] Upload limits are enforced on the server; other room prefixes cannot read or reference this room's media.
- [ ] A failed send preserves the draft and file; retrying an accepted request creates one message and reuses its upload.
- [ ] History JSON contains metadata only; no base64 data or additional image bytes are sent on each poll.
- [ ] Fixed expiry and orphan-upload cleanup work; an expired image leaves a readable caption and fallback.
- [ ] Keyboard users can select/remove an image and send; the image fits a 375px-wide viewport.

## Validation

Use Node.js 24 and `npm ci`, then run `npm run check` after implementation. Test with two browser sessions using the **same development room prefix**. Verify successful upload/send, reload, a blocked upload, a failed POST/retry, and missing-media fallback. With workshop Redis available, verify one real upload/read, room isolation, upload-limit behavior, and TTL/expiry in a disposable development room; fake time or mocks alone do not verify Redis Lua. Never clear production data to test expiry. Record passed checks and any checks not run, including unavailable Redis/browser verification.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Follow `AGENTS.md` and `CONTRIBUTING.md`. Start with `git status`, preserve unrelated changes, fetch `origin`, and create a feature branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-image-attachments`. Keep the change focused and leave `CHAT_TITLE` in `src/config/chat.ts` unchanged. Preserve existing message history, Production/Preview/personal-local `CHAT_ROOM_PREFIX` separation, and server-only Redis credentials. Add no paid plans/APIs or new external storage service. Never commit secrets, `.env*`, `.vercel`, dependencies, or build output.

Prepare a focused commit message and PR title/body with the user-visible change, validation results, limits, and `Fixes #<actual GitHub issue number>`; `CHAT-04` is a planning ID, not the GitHub number. The PR base must be `develop`. The author must understand and explain the implementation, and another human must review and approve it; AI feedback is not human approval. Pasting this issue authorizes local implementation and validation only. Do not automatically commit, push, open a PR, publish, merge, or close the issue unless separately instructed. Follow the facilitator's release process; issue closure after integration is handled by the develop push workflow.
