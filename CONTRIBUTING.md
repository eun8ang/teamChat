# Contributing

**English** | [한국어](CONTRIBUTING.ko.md)

Improve Team Chat through small issues and PRs. Start each feature/fix branch from the latest `develop` and target `develop` in your PR. Do not push directly to `main` or `develop`.

Participants chat in a shared room. Display names are not authenticated accounts. Keep UI tasks focused on their components and styles. Preserve the shared message API, Redis storage, and separate Production, Preview, and local room prefixes. Never commit credentials or put Redis secrets in client code or `NEXT_PUBLIC_*` variables.

## Required Git skill and naming

Before an AI generates any commit message, PR title/body, or draft PR, it must read and apply [git-issue-pr](.agents/skills/git-issue-pr/SKILL.md). Claude Code can invoke `/git-issue-pr`. This applies to suggested text as well as executed commands; it does not authorize publishing or merging.

Write commit subjects and PR titles in English as `<type>(optional-scope): imperative description (#actual-issue-number)`. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. Use `feat` for a feature and `fix` for a bug repair; resolving a GitHub issue does not make every change a `fix`. For example: `feat: add emoji picker (#12)`. Use actual issue numbers, not catalog IDs such as `CHAT-01`.

## Set up

Use Node.js **24.x** (`.nvmrc`). Follow [Getting started](README.md#getting-started) to clone, install with `npm ci`, and configure `.env.local` with the facilitator's development Redis settings and your own local prefix. Never use the Production prefix locally.

```bash
git status
git config --local user.name "Your Name"
git config --local user.email "YOUR_GITHUB_EMAIL"
npm run doctor
npm run dev
```

The Git identity settings apply only to this repository. `doctor` does not verify GitHub authentication. Keep the development server running in a separate terminal and verify sending messages at [the local app](http://127.0.0.1:3000).

## Issue and branch

Choose **Issues → New issue → Workshop task**. Describe the problem, scope, acceptance criteria, and verification steps. Assign yourself and agree with your partner on file ownership. Use labels and milestones only if the facilitator has prepared them.

Replace `12` and the branch description below with your actual issue and task. Finish or save any uncommitted work before switching branches.

```bash
git status
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/12-chat-title
```

If local `develop` does not exist, use `git switch --track origin/develop`. If remote `develop` is missing or `pull --ff-only` fails, inspect the cause with the facilitator. Do not force-push. Use `feature/*` for features/design changes and `fix/*` for bug fixes.

## Implement, verify, and commit

Make the smallest change that meets the issue's acceptance criteria. Read AI-generated code yourself and be able to explain its behavior and purpose.

```bash
npm run check
git diff
git status --short
```

This runs lint, type checking, tests, and the Production build. Also check the normal flow and relevant edge cases in the browser. For a title change, verify the agreed title, long text on mobile, and existing message sending. Record checks you did not run and why.

Stage only relevant files. These paths are examples for a title change; include any related test files you changed.

```bash
git add src/config/chat.ts
git diff --staged
git commit -m "feat: label our team chat (#12)"
git push -u origin feature/12-chat-title
```

Check the staged diff for environment files, tokens, and unrelated lockfile changes.

## PR, peer review, and merge

1. Open a PR with **base `develop` / compare your working branch**.
2. Complete the template with a standalone `Fixes #12` line for each fully resolved issue, the reason for the change, acceptance criteria, check results, and your own verification. Use `Refs #12` for partial work or context; it does not request closure. Replace every example number with the actual GitHub issue number.
3. Request your partner in **Reviewers**. Keep the PR in Draft until ready, then choose **Ready for review**.
4. Review the issue, diff, CI, and actual behavior. Use **Comment** for questions and **Request changes** for required fixes. Include the file, reproduction steps, and expected result.
5. The author commits fixes to the same branch and pushes to the same PR, checks CI again, and requests another review.
6. Someone other than the author submits **Approve**. AI feedback does not replace human approval.
7. The designated merger checks approval, passing required checks, the latest base, and absence of conflicts, then uses **Create a merge commit**.
8. Verify the integration in the facilitator's `develop` Preview and record the result in the issue. The develop push workflow verifies the merged PR and closes its fully resolved `Fixes` issues as completed. Issue closure means integration into `develop`; follow the facilitator's separate release instructions for Production.

The issue-closing workflow must first be merged into `develop` before participants rely on it. GitHub's native closing keywords apply to its default branch (`main`); this repository uses the develop push workflow for integration. Opening a PR, closing one without merging, pushing a feature branch, and `Refs` references do not close issues through this workflow.

Approve records a review; Merge integrates code. **Resolve conversation** closes a review discussion.

To update your working branch with `develop`:

```bash
git switch feature/12-chat-title
git fetch origin
git merge origin/develop
# If conflicts occur, edit the files, then git add <resolved-files> and git commit.
npm run check
git push
```

Repeat peer review after resolving conflicts. Use `git merge --abort` to cancel an in-progress merge if needed. After merging a feature branch, start the next task on a new branch from updated `develop`.

## Isolated conflict exercise

```bash
npm run workshop:conflict:en
```

This creates a new repository in your OS temporary directory, with a conflict between `feature/title-emoji` and `feature/title-room` in `src/config/chat.ts`. It has no remote and does not change this project. Follow the printed `cd` command. Remove the conflict markers and preserve both intentions:

```ts
export const CHAT_TITLE = "💬 Team Chat · Workshop room";
```

```bash
git add src/config/chat.ts
git commit -m "fix: preserve both chat title changes"
git status
git log --oneline --graph --all --decorate
```

You are done when the working tree is clean and the merged title preserves both changes. Return to the original project directory afterward. Each run creates a new temporary repository. The Korean exercise remains available with `npm run workshop:conflict`.
