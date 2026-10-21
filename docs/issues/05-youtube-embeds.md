# Play a shared YouTube video inside the conversation

- Ticket: `CHAT-05`
- Difficulty: Intermediate
- Estimate: 45–75 minutes
- Dependencies: None
- Main files: new `src/components/chat/YouTubeAttachment.tsx`, `src/lib/youtube.ts`, and focused tests
- Small integration changes: `src/components/chat/MessageBubble.tsx` and feature styles

## Goal

Implement this issue in the existing repository. When a message contains a supported YouTube video link, offer a “Load video” button and let the participant play the video inside the conversation. Keep sending and storing ordinary text messages unchanged.

## Current behavior

`MessageBubble` renders the whole message as plain text inside a paragraph. There is no video preview or iframe. Shared messages are stored as text in Redis and arrive through `useChat` polling. YouTube playback can be derived from that text, so this feature does not need a new API, message kind, Redis record, or common hook change.

## Implementation requirements

1. Read `AGENTS.md`, `CONTRIBUTING.md`, `MessageBubble.tsx`, `MessageList.tsx`, `src/types/chat.ts`, and the existing chat component tests. Add a small parser helper and a dedicated client component for the optional video player. Keep the integration in `MessageBubble` minimal.
2. Recognize complete **HTTPS** video URLs on an exact host allowlist: `youtube.com`, `www.youtube.com`, `m.youtube.com`, and `youtu.be`. Support `/watch?v=VIDEO_ID`, `/shorts/VIDEO_ID`, `/embed/VIDEO_ID`, and `https://youtu.be/VIDEO_ID`. Validate IDs with `^[A-Za-z0-9_-]{11}$`; use the platform `URL` parser and explicit path checks. Ignore extra query parameters such as `t` or tracking parameters rather than forwarding them to the iframe.
3. Find supported URLs inside a longer sentence and trim common trailing sentence punctuation without damaging the video ID. Use only the first valid supported video per message. Invalid or unsupported URLs must leave the original text readable and must not create a player. Include deterministic parser tests for punctuation, more than one candidate, missing IDs, malformed URLs, and unsupported paths.
4. Reject HTTP, userinfo, unexpected ports, hostname lookalikes such as `youtube.com.example.invalid`, and arbitrary iframe/HTML input. Do not turn user text into raw HTML, accept embed code, fetch a URL on the server, follow redirects to discover videos, or call YouTube/oEmbed APIs. Do not add an API key or a paid dependency.
5. Keep the complete message text visible. Under it, render an accessible placeholder with a normal external video link and a “Load video” button. Label the destination, use `target="_blank"` with `rel="noopener noreferrer"` if opening a new tab, and construct the external URL from the validated ID. Loading the page or receiving a message must make **no YouTube network requests**; create the iframe only after the participant clicks the load button. This includes thumbnails and preconnects.
6. Build the iframe source from the validated ID only: `https://www.youtube-nocookie.com/embed/VIDEO_ID`. Do not copy arbitrary URL parameters. Give the iframe a descriptive title, `loading="lazy"`, an appropriate referrer policy, fullscreen support, and only the permissions needed for normal playback. Do not request autoplay. Provide a “Hide video” button that removes the iframe and stops playback.
7. Constrain the player to the message width with a 16:9 aspect ratio. It must fit a 375px-wide viewport without horizontal page overflow. Preserve author, timestamp, own-message styling, image attachments if present, and message-list semantics. Place the player beside the text paragraph in the message article, not inside the paragraph.
8. Show a persistent “Open on YouTube” link so the participant can watch a video that cannot be embedded. Do not claim to detect all playback failures from cross-origin iframe events; describe that some videos may require opening YouTube. No external metadata lookup or custom thumbnail service is needed.
9. Add meaningful parser and component tests covering valid/invalid hosts and IDs, text preservation, no iframe before user action, a validated nocookie iframe after loading, and iframe removal on hide. Reuse existing test tools and keep tests offline.

## Acceptance criteria

- [ ] A supported watch, short, embed, or youtu.be URL produces one video placeholder without changing stored message text.
- [ ] A sentence containing a supported link remains fully readable, including any text before and after the URL.
- [ ] No YouTube request occurs before “Load video” is clicked; loading and hiding work with a keyboard.
- [ ] The generated player uses only the validated 11-character ID on `www.youtube-nocookie.com` and does not autoplay.
- [ ] Malicious/lookalike hosts, HTTP URLs, malformed IDs, and pasted iframe HTML produce no player.
- [ ] A normal external link remains available if embedding is blocked or the video is unavailable.
- [ ] The player fits a narrow screen and coexists with any existing message attachments.
- [ ] Text-only messages, sending, polling, and existing history continue working.

## Validation

Use Node.js 24 and `npm ci`, then run `npm run check`. In a browser, send a supported public video URL with surrounding text and verify load, play, hide, keyboard focus, and narrow-screen layout. Use browser network tools to confirm no YouTube/thumbnail request before loading. Check a lookalike-host URL and a video that is unavailable for embedding; keep the external link usable. Verify refresh in a second session derives the same placeholder from the shared text message. Record passed checks and any checks not run, including playback checks blocked by network access.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Follow `AGENTS.md` and `CONTRIBUTING.md`. Start with `git status`, preserve unrelated changes, fetch `origin`, and create a feature branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-youtube-embeds`. Focus on the parser and player component; leave common message types, hooks, and page assembly unchanged unless a small integration is essential. Leave `CHAT_TITLE` in `src/config/chat.ts` unchanged. Preserve message history, Production/Preview/personal-local `CHAT_ROOM_PREFIX` separation, and server-only Redis credentials. Add no paid plans/APIs. Never commit secrets, `.env*`, `.vercel`, dependencies, or build output.

Prepare a focused commit message and PR title/body explaining the visible behavior, URL rules, and validation results, with `Fixes #<actual GitHub issue number>`; `CHAT-05` is a planning ID. The PR base must be `develop`. The author must explain the change and another human must review and approve it; AI feedback does not replace human approval. Pasting this issue authorizes local implementation and validation only. Do not automatically commit, push, open a PR, publish, merge, or close the issue unless separately instructed. Follow the facilitator's release process; issue closure after integration is handled by the develop push workflow.
