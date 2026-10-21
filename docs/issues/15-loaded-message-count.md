# Show an accurate count of loaded messages

| Field | Value |
| --- | --- |
| Ticket | CHAT-15 |
| Difficulty | Beginner; short workshop task |
| Estimated implementation time | 10–15 minutes, excluding review |
| Prerequisites | None |
| Primary files | `src/components/chat/ChatStats.tsx` |
| Optional files | A focused component test; narrowly scoped styles in `src/app/globals.css` |

## Goal

Implement a visible message count beside the connection status so participants can see the conversation grow. Describe the value accurately as the messages currently loaded in this browser.

## Current behavior

`src/app/page.tsx` already passes the canonical `messages.length` and connection status to `ChatStats`. The component displays Connected, Connecting…, or Reconnecting…, but places the count inside an `sr-only` span. The server initially returns up to 100 recent messages, retains up to 500, and `useChat` keeps at most 300 messages in the browser. This prop is not an all-time room total.

## Implementation requirements

1. Use the existing `messageCount` prop and show **0 messages loaded**, **1 message loaded**, or **N messages loaded** beside the existing connection label. Use English number formatting for larger values.
2. Preserve all three connection labels and their status indicators. If a later request fails, keep the count for messages already loaded while displaying Reconnecting…. Do not replace retained data with a fake zero.
3. Replace the existing screen-reader-only count with a single accessible visible count. Keep the current polite status announcement without adding duplicate live regions.
4. Keep the count tied to the canonical loaded message list. If message search is implemented, filtering must not change this count. A separate search result count belongs to the search feature.
5. Do not add API calls, room totals, presence counts, browser persistence, or changes to the message hook, message schema, or page composition. If spacing needs adjustment, limit CSS changes to the footer/statistics selectors.

## Acceptance criteria

- [ ] Zero, one, and multiple loaded messages use the correct text and plural form.
- [ ] Receiving or successfully sending a message updates the displayed count through the existing prop.
- [ ] Connecting, Connected, and Reconnecting remain visible and understandable.
- [ ] The count remains visible when reconnecting and, if search exists, while filtering.
- [ ] The label says “messages loaded”; it does not claim to count the entire room history or online users.
- [ ] There is one accessible count, and the footer fits at 360 px and desktop widths.
- [ ] No API, hook, storage, or configuration changes are introduced.

## Validation

Use Node.js 24, run `npm ci`, and run `npm run check` after implementation. Check zero, one, and multiple messages and the existing connection states. A focused test rendering `ChatStats` with representative props is sufficient if adding coverage; do not create a new end-to-end test framework for this UI task.

In the browser, send and receive messages, briefly simulate a failed message request, and inspect the footer at 360 px and desktop widths. If search is available, confirm that searching changes the results without changing this count. Record the results and any checks not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Read `AGENTS.md` and `CONTRIBUTING.md`. Check the working tree, fetch `origin`, and create `feature/<actual-issue-number>-loaded-message-count` from the latest `origin/develop`; preserve existing user changes. Keep changes centered on `ChatStats`. Preserve `CHAT_TITLE` in `src/config/chat.ts`, shared Redis persistence, server-only credentials, existing message behavior, and Production/Preview/local `CHAT_ROOM_PREFIX` values. Add no paid service and never commit secrets, `.env*`, `.vercel`, dependencies, or build output.

Prepare a suggested commit message and a PR description containing `Fixes #<actual-issue-number>`, what changed, and the validation results. Set the PR base to `develop`. The author explains the change and another person reviews it; AI feedback does not replace human approval. Pasting this issue authorizes local implementation and checks; push, PR creation, merge, and deployment remain participant actions unless separately requested.
