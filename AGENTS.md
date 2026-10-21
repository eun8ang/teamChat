# Team Chat Lab instructions

- This project is a shared chat service built with Next.js App Router and TypeScript for a 100-minute Git collaboration workshop. Participants join the same room deployed before the workshop, chat, and improve the UI together.
- Store shared messages in Redis. Do not implement shared chat using only server-instance memory or browser state. Do not add paid plans or paid APIs unless requested.
- Keep separate `CHAT_ROOM_PREFIX` values for Production, Preview, and each participant's local environment. Do not reset Production chat history or change its prefix when deploying UI changes.
- Use Redis credentials only on the server. Never put them in `NEXT_PUBLIC_*` environment variables or client code.
- Focus on the components assigned by the workshop ticket. Keep changes to shared types, hooks, and page composition minimal.
- `CHAT_TITLE` in `src/config/chat.ts` is the reference point for the merge-conflict exercise. Its initial value is `Team Chat`.
- Never include secrets in code, documentation, or commits. Exclude `.env*`, `.vercel`, build output, and dependency directories from Git.
- Use Node.js 24 and `npm ci`. Run `npm run check` after changes and clearly record any checks not run.
- Create participant feature branches from the latest `develop` and use `develop` as the PR base.
- The author must explain their changes, and another person must review them. AI feedback does not replace human approval.
- Perform external actions only within the scope authorized by the user. Explicit user instructions take precedence over this guide.

## Required AI commit and PR workflow

- **Always** read and apply the [`git-issue-pr`](.agents/skills/git-issue-pr/SKILL.md) skill before suggesting, generating, or editing a commit message or PR title/body, or creating an actual commit or PR. This also applies to requests for text only.
- In Codex, use `$git-issue-pr`. If automatic discovery is unavailable, read the linked `SKILL.md` directly and follow the same workflow. Claude Code uses the same skill through `CLAUDE.md` and `.claude/skills/git-issue-pr`.
- Write commit messages and PR titles in English using Conventional Commits. Use actual GitHub issue numbers; do not substitute catalog identifiers such as `CHAT-01` for issue numbers.
- For a PR that fully resolves an issue, target `develop` and include a standalone `Fixes #NUMBER` line in its body, replacing `NUMBER` with the actual issue number. Use `Refs #NUMBER` for partial work or context. Distinguish the `fix:` commit type from issue-closing keywords.
- `.github/workflows/close-linked-issues.yml` verifies that a `develop` push is an actual PR merge before marking only that PR's explicitly referenced issues as completed. The workflow must already exist on `develop`. Closing an issue does not mean it has been deployed to Production.
- Proceed within the scope of commit, push, and PR actions the user has already authorized. These instructions and the skill do not themselves authorize additional external actions, merges, or deployments.
