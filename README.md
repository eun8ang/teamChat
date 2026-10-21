# Team Chat Lab

**English** | [한국어](README.ko.md)

A Git and GitHub collaboration workshop starter with **100 minutes of hands-on practice + 20 minutes for introductions, questions, and delays**. The audience joins a shared chat deployed before the workshop, then improves its Next.js UI while practicing Clone → Branching / Checkout → Commit → Push → PR → Review PR → Merge → Resolve merge conflicts → Deploy.

**Join the chat:** Open [teamchat-jet.vercel.app](https://teamchat-jet.vercel.app) and enter your name. Feature PRs are merged into `develop` and checked in Preview. At the end, merge a `develop → main` PR to see the improvements at the same Production URL.

## Getting started

You need Node.js **24.x** and Git. Node.js 24 and npm are installed on the presenter's macOS environment. If you use nvm, run `nvm install && nvm use` to apply `.nvmrc`.

```bash
git clone https://github.com/eun8ang/teamChat.git
cd teamChat
git switch develop
npm ci
npm run doctor
cp .env.example .env.local
# Add the workshop Redis settings and your own CHAT_ROOM_PREFIX to .env.local.
npm run dev
```

[Open the chat app](http://127.0.0.1:3000). If this project is already set up locally, run `npm run dev` from its directory.

Enter your name to chat with other participants in the same room. New messages appear about every 1.5 seconds; polling pauses in hidden tabs. Messages are stored in Redis and survive page refreshes and UI deployments. Your name and temporary participant ID are stored in per-tab `sessionStorage`. The app does not provide account authentication.

## Shared chat configuration

The project uses **Upstash for Redis / Free** through Vercel Marketplace, with automatic paid upgrades and Production Pack disabled. Storage credentials are used only on the server.

| Environment variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Server secret for reading and writing Redis data |
| `CHAT_ROOM_PREFIX` | Data isolation: Production `teamchat:production`, integration practice `teamchat:preview`, personal development `teamchat:local:your-name` |
| `NEXT_PUBLIC_BUILD_SHA` | Public value used to identify the deployed commit in the UI |

The `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables created by the Vercel integration are also supported. Without storage configuration, the API returns 503 instead of falling back to simulated chat that is not shared. Participants receive workshop server settings separately; GitHub and Vercel management tokens are not shared with them.

The presenter's local `.env.local` contains development Redis connection settings. This file is excluded from Git and has restricted access permissions. It does not contain the supplied GitHub or Vercel management tokens.

The app initially loads the latest 100 messages, then fetches only newer messages. The server retains up to 500 messages. Room history expires after 24 hours without a new message. The server validates message length, names, and sending frequency, and retries of the same message do not create duplicate records. UI tasks should leave this data layer and the Production prefix unchanged.

The connected Free plan allows 500,000 commands per month, with automatic paid upgrades disabled. Check delivery latency and usage with the expected number of concurrent participants before the workshop.

## Presentation and exercises

```bash
npm run present
```

[Open the presentation](http://127.0.0.1:4173/?lang=en). Use the large term headings and Git flowchart to explain each step, then demonstrate the same actions in the terminal, editor, and GitHub.

Use the **한국어 / English** selector in the top toolbar to change language without leaving the current slide. Slides, controls, and the flowchart switch together. The URL keeps the selected language and slide, so refreshing or sharing it preserves both. Navigation: arrow keys / Space, `G` for the flowchart, `F` for fullscreen, Home / End.

Participant instructions, templates, and the English conflict exercise are available in English. The detailed facilitator plan remains in Korean.

- [100-minute schedule and exercise commands](docs/workshop.en.md)
- [Large Git flowchart](docs/git-flow.en.svg)
- [Detailed workshop plan and optional extensions (Korean)](git-github-workshop-plan.md)
- [Branch, PR, and review rules](CONTRIBUTING.md)

```bash
npm run workshop:conflict:en
```

The conflict exercise creates a separate Git repository in your OS temporary directory. Change to the printed path and resolve a conflict between two branches that changed the same title.

## Checks

```bash
npm run check
```

This runs ESLint → TypeScript → Vitest → Production build. Use `npm run test:ci` to run only the tests. Dependency versions are pinned in `package.json` and `package-lock.json`.

The dependency audit found no known vulnerabilities in Production dependencies. Warnings remain in development dependencies used by Vercel CLI and ESLint. Vite was updated to a patched version, and the CLI's tar dependency is pinned to a patched version through `overrides`. Do not run `npm audit fix --force` without checking compatibility.

## Vercel and GitHub Actions

Vercel project: [`cw-my/teamchat`](https://vercel.com/cw-my/teamchat), using Node.js `24.x`. Local project linking information is stored in `.vercel/project.json`, which is excluded from Git. Tokens are not stored in project files.

| Event | Check | Deployment |
| --- | --- | --- |
| Push to a working branch, such as a feature branch | push-ci | None |
| Any PR | workshop-ci | None |
| Push to develop | After push-ci succeeds | Preview |
| Push to main | After push-ci succeeds | Production |

Automatic Git deployments are disabled in `vercel.json`; Actions handles deployment. The required repository Actions secrets are listed below.

[PR checks](.github/workflows/pr-checks.yml) and [push checks and deployment](.github/workflows/workshop.yml) run separately. Branch protection requires the PR check named `workshop-ci`.

Merging a `develop → main` PR triggers a main push event: **checks, tests, and build → Production deployment on success**. Approving a PR alone does not trigger deployment. `release/*` branches are optional in the extended workshop.

| Name | Value |
| --- | --- |
| `VERCEL_TOKEN` | Enter the supplied deployment token in the secret input field |
| `VERCEL_ORG_ID` | `team_rahK1hPbGerm53jaqqOGOEkP` |
| `VERCEL_PROJECT_ID` | `prj_PE3p8eCd0HX2jIlVkLAgMOsBeIuN` |

Use an account with repository administration permissions to register these values in [Actions secrets settings](https://github.com/eun8ang/teamChat/settings/secrets/actions). To register the token through the CLI, use the secret input prompt from `gh secret set VERCEL_TOKEN --repo eun8ang/teamChat`. Participants do not need the deployment token.

The GitHub `main` and `develop` branches require a PR, one approval from another person, and a successful `workshop-ci` check. Merge commits are allowed. Do not make `deploy` a required PR check, because it does not run on PRs. Verify Preview access and review and merge permissions with two separate accounts before the workshop.

## Presenter setup

- Remote `origin`: `https://github.com/eun8ang/teamChat.git`.
- The Vercel project is connected to shared storage on Upstash Free.
- `CHAT_ROOM_PREFIX` is separated across Production, Preview, and development.
- Repository Actions secrets and the `preview` and `production` deployment environments are configured.
- Merge commits are enabled; squash merges, rebase merges, and automatic deletion of working branches are disabled.

Use these commands only when initializing a new repository. Participants should clone the repository and create their working branches from `develop`.

```bash
git push -u origin main
git push -u origin develop
git push origin workshop-start
```

If new commits appear on the remote, run `git fetch origin` and inspect the history first. Do not force-push.
