# Add a persistent light and dark theme switcher

| Field | Value |
| --- | --- |
| Ticket | CHAT-14 |
| Difficulty | Intermediate; UI extension |
| Estimated implementation time | 40–60 minutes, excluding review |
| Prerequisites | None |
| Primary files | `src/components/chat/ThemeSwitcher.tsx` (new), `src/hooks/useTheme.ts` (new), `src/app/globals.css` |
| Integration files | `src/components/chat/ChatHeader.tsx`; change `src/app/layout.tsx` only if required for initialization |

## Goal

Implement a light and dark theme switcher for Team Chat Lab. Make the whole chat comfortable to read in either theme, and remember the visitor's choice after a reload.

## Current behavior

The app uses a light palette in `src/app/globals.css`, including `color-scheme: light`. Some colors are CSS variables, but many surfaces, text colors, and borders are hardcoded. `ChatHeader` has no appearance control. There is no theme preference storage.

## Implementation requirements

1. Add a keyboard-accessible control in `ChatHeader` with the accessible name **Appearance** and three labeled choices: **System**, **Light**, and **Dark**. A labeled native select is sufficient. Keep the control usable at a 360 px viewport width.
2. Put preference handling in a focused client component or hook. Store only the selected appearance preference in `localStorage` under `team-chat-theme`. Validate stored values; an absent or invalid value means System. Catch blocked-storage errors so the control still works for the current page.
3. In System mode, use `prefers-color-scheme` and react to operating system changes. An explicit Light or Dark choice overrides system changes. Remove event listeners on cleanup.
4. Apply the resolved theme with a `data-theme` attribute on the document root and the matching CSS `color-scheme`. Keep the server output and first client render compatible. Do not read browser APIs during server rendering. If adding pre-paint initialization, keep it small and limit any hydration exception to the root theme attribute.
5. Extend semantic color variables and replace the hardcoded colors needed for the existing shell, sidebar, header, notice, messages, inputs, buttons, footer, errors, and focus indicators. Preserve the current light theme's appearance and use scoped changes rather than a layout redesign.
6. Maintain readable text, borders, selected states, placeholders, and disabled controls in both themes. Aim for WCAG AA text contrast; verify representative foreground/background pairs. Retain visible keyboard focus and existing reduced-motion behavior.
7. Theme is a personal browser preference. It must not change anyone else's UI, messages, participant identity, or Redis data. No theme library or service is needed.

## Acceptance criteria

- [ ] System, Light, and Dark are visible, understandable, and keyboard operable.
- [ ] An explicit selection survives a reload; System follows system appearance changes.
- [ ] Missing, malformed, or unavailable browser storage does not prevent joining or sending messages.
- [ ] The sidebar, conversation, composer, connection states, and error feedback remain readable in both themes.
- [ ] Switching themes keeps the current message draft, identity, message history, and scroll position.
- [ ] The control fits at 360 px and desktop widths without horizontal overflow.
- [ ] There are no hydration warnings or uncaught storage errors.

## Validation

Use Node.js 24, install dependencies with `npm ci`, and run `npm run check` after the change. Add focused behavior coverage for preference restoration, invalid or blocked storage, and System updates if introducing a preference hook. For the palette itself, inspect both themes in the browser rather than asserting CSS implementation details.

Manually switch through all choices, reload with Dark selected, simulate a system appearance change, and test keyboard navigation at 360 px and desktop widths. Send a message before and after switching. Record commands, results, screenshots, and any checks that were not run.

## Delivery workflow

Before generating any commit message, PR title/body, or draft PR, read and apply `.agents/skills/git-issue-pr/SKILL.md` (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles; use `feat` for a new feature even when it resolves an issue. In the PR body, put `Fixes #<actual-issue-number>` on its own line for each fully resolved issue; use `Refs #<actual-issue-number>` only for partial work or context. Once the develop push workflow exists on `develop`, it closes fully resolved issues as completed only after verifying the PR was merged into `develop`. That closure means integration into develop, not a Production deployment.

Read `AGENTS.md` and `CONTRIBUTING.md`. Check the working tree, fetch `origin`, and create `feature/<actual-issue-number>-theme-switcher` from the latest `origin/develop`; preserve any existing user changes. Keep the work focused on appearance and minimal header integration. Preserve `CHAT_TITLE` in `src/config/chat.ts`, the message API, Redis persistence, all `CHAT_ROOM_PREFIX` values, and server-only credentials. Add no paid service. Never commit secrets, `.env*`, `.vercel`, dependencies, or build output.

Prepare a suggested commit message and PR description with `Fixes #<actual-issue-number>`, behavior changes, acceptance results, and validation evidence. The PR base is `develop`. The author must be able to explain the change, and another person must review it; AI feedback does not replace human approval. Pasting this issue authorizes local implementation and checks; push, PR creation, merge, and deployment remain participant actions unless separately requested.
