# Search messages already loaded in the conversation

| Field | Value |
| --- | --- |
| Ticket ID | CHAT-08 |
| Difficulty | Intermediate |
| Estimate | 30–45 minutes |
| Prerequisites | None; implement against the latest `origin/develop` |
| Primary files | `src/components/chat/MessageSearch.tsx`, `src/components/chat/MessageList.tsx`, `src/app/page.tsx`, `src/app/globals.css` |

## Goal

Enable the existing search field so participants can quickly find a message or author in the messages their browser has loaded. Treat this issue body as the implementation brief for Codex or Claude Code.

## Current behavior

`MessageSearch` renders a disabled input. `Home` passes all `useChat().messages` to `MessageList` and passes their count to `ChatStats`. The hook polls the existing message API and keeps at most `MAX_CLIENT_MESSAGES` (currently 300) messages. Redis contains shared history, but this ticket does not add a historical search API.

## Implementation requirements

1. Make `MessageSearch` a controlled component with a small interface such as `value: string` and `onChange(value: string): void`. Own the query at the nearest existing shared parent, `src/app/page.tsx`; keep page edits limited to state, derived filtering, and component wiring.
2. Search message `content` and `displayName` using case-insensitive substring matching. Trim the query for matching; an empty or whitespace-only query shows all loaded messages. Treat punctuation literally rather than as a regular expression.
3. Derive the displayed list from the canonical hook messages on every query/message change. Never filter or mutate `useChat` state, change polling cursors, alter message order, or fetch an archive in this task. New matching messages must appear while the query stays active.
4. Keep `ChatStats` connected to the full loaded message count. Show an accessible result summary such as “3 matching messages out of 24 loaded” when searching, and clearly state that only loaded messages are searched.
5. Add a labeled clear-search button and let Escape clear the query while the search field has focus. Preserve focus in the input when clearing. Replace the workshop placeholder and disabled styling with usable English labels and visible focus styling.
6. Distinguish a genuinely empty room from a search with no results. For no results, show “No matching loaded messages” and a clear-search action; do not claim the room has no messages. Add only the smallest optional `MessageList` props or presentation state necessary for this distinction.
7. Keep search usable on mobile and by keyboard. Render text using React text nodes; do not use `dangerouslySetInnerHTML` for search highlighting. Highlighting is optional and should not expand this task.
8. Prevent filtering itself from triggering `MessageList`'s existing newest-message scroll effect, even when the unread-message feature has not been implemented. Use a small optional filter-state prop, such as `isFiltered`, with an unchanged default for existing callers. Suppress programmatic following during filtering and when entering or leaving search; reset the scroll effect's baseline so clearing a query does not replay a false arrival. Natural browser scroll clamping when a list becomes shorter is acceptable.
9. If the unread-message feature is already merged, reuse its filter-state API and ensure query changes do not create unread counts. Do not copy another unmerged ticket's implementation or implement unread tracking as part of this task.

## Acceptance criteria

- [ ] The existing toolbar search field is enabled and clearly labeled.
- [ ] Content and author matches ignore case; punctuation and non-Latin text work as literal text.
- [ ] Empty or whitespace-only queries restore all loaded messages in their original order.
- [ ] Clearing via the button or Escape keeps focus in the search field.
- [ ] Result count, loaded-only scope, and an appropriate no-results message are visible and accessible.
- [ ] A new matching message appears without clearing the query, and a nonmatching message remains hidden.
- [ ] Clearing a search reveals messages received during that search, with no duplicate or lost messages.
- [ ] Typing, changing, and clearing a query do not programmatically jump to the newest result, including before unread tracking is implemented.
- [ ] Connection status and `ChatStats` still use the unfiltered conversation state; search does not issue extra network requests.
- [ ] Sending messages and shared Redis persistence continue to work.

## Validation

Use Node.js 24 and run `npm ci`, then run `npm run check`. Add focused tests for content/author matching, literal punctuation, clearing, no results, and arrival of a message during an active query. Verify the canonical loaded count stays unchanged by filtering and that query changes do not trigger programmatic scrolling.

Manually test a narrow screen and keyboard navigation. In a second browser session, send matching and nonmatching messages while a query is active. Record command results and explicitly identify any checks not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

- Read and follow `AGENTS.md` and `CONTRIBUTING.md`. Begin with `git status`; protect existing work. Fetch origin and create a fresh branch from the latest `origin/develop`, for example `feature/<actual-issue-number>-message-search`. Do not reuse a merged feature branch.
- Preserve Redis-backed shared message persistence, server-only Redis credentials, and the separate Production/Preview/local `CHAT_ROOM_PREFIX` values. Do not reset history, change the current `CHAT_TITLE` in `src/config/chat.ts`, add paid services, or commit secrets, `.env*`, `.vercel`, dependencies, or build output.
- Keep shared hooks, shared types, and page assembly changes minimal. Review the diff and stage only relevant files when the participant requests a commit.
- Prepare a suggested commit message and PR summary explaining behavior, implementation choices, validation, and remaining limitations. Use the actual GitHub issue number in `Fixes #<actual issue number>`; `CHAT-08` is a catalog ID, not a GitHub issue number. Set PR base to `develop` and follow `CONTRIBUTING.md` for issue status.
- The author must explain the change and another human must review it. AI feedback does not replace human approval. Push, open a PR, or deploy only within the participant's explicit authorization.
