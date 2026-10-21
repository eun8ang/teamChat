# Team Chat · 100-minute collaboration workshop

[English](workshop.en.md) | [한국어](workshop.md)

Allow **100 minutes of practice + 20 minutes for introductions, questions, authentication, network issues, and deployment delays**. Join [the shared Production chat](https://teamchat-jet.vercel.app), enter your name, and exchange messages. Improve that app through an issue, branch, PR, peer review, merge, and deployment.

Run `npm run present` and open [the English presentation](http://127.0.0.1:4173/?lang=en). Use `←` / `→` / `Space` to navigate, `G` for the flowchart, `F` for fullscreen, and `Home` / `End` for the first/last slide. Use the **한국어 / English** selector in the top toolbar to switch languages while keeping the current slide. The URL preserves the selected language and slide on refresh or sharing. The [English flowchart](git-flow.en.svg) is also available separately.

## Before the workshop

The facilitator prepares the shared Redis backend, Production URL, separate Production/Preview/local room prefixes, repository write access, `main` and `develop`, and deployment settings. Merge the [issue-closing workflow](../.github/workflows/close-linked-issues.yml) into `develop` before participants rely on automatic closure. Require one approval from someone other than the author and a passing `workshop-ci` check for feature and release PRs. Allow merge commits.

Verify Preview access and review/merge permissions using two accounts. In two browsers, exchange messages under different names, refresh, and verify that history survives a UI redeployment. Share only workshop development Redis settings with participants; keep GitHub/Vercel management tokens private. Do not add backend setup to the 100-minute session.

## Schedule

| Minutes | Work | Evidence |
| --- | --- | --- |
| 0–10 | Join Production, exchange messages, choose a small UI task | Shared messages and assigned issue |
| 10–20 | Clone, configure local settings, run the app | Local app sends and displays messages |
| 20–30 | Create an issue and branch from updated develop | Acceptance criteria and feature/fix branch |
| 30–50 | Implement a small change and verify it | Passing checks and browser results |
| 50–75 | Open PRs, review in pairs, fix, merge to develop | Peer approval, CI, integration Preview |
| 75–90 | Freeze develop; one pair handles the shared release PR while everyone practices conflicts | Resolved conflict and approved release PR |
| 90–100 | Verify Production and submit evidence | Production URL, deployed main SHA, improved UI, shared messages |

## Participant workflow

Follow [Getting started](../README.md#getting-started) for Node.js 24, `npm ci`, `npm run doctor`, `.env.local`, and `npm run dev`. Use your own local `CHAT_ROOM_PREFIX`; never reuse the Production prefix. Before generating any commit message or PR text, including drafts, the assistant must read and apply [git-issue-pr](../.agents/skills/git-issue-pr/SKILL.md) (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles with the actual issue number.

Follow [Contributing](../CONTRIBUTING.md) for the complete commands and review process. Create **Issues → New issue → Workshop task**, assign yourself, and agree on file ownership with your partner. Replace example issue numbers with real ones.

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/12-chat-title
# Implement and verify the issue's acceptance criteria.
npm run check
git diff
git add src/config/chat.ts # Example: stage only your actual changed files.
git diff --staged
git commit -m "feat: update title (#12)"
git push -u origin feature/12-chat-title
```

Open a PR with **base `develop` / compare your working branch**. Use a standalone `Fixes #12` line for the fully resolved actual issue, record acceptance criteria and check results, and request your partner in Reviewers. Use `Refs #12` for partial work or context. The develop push workflow verifies the merged PR and closes fully resolved issues as completed; this means develop integration, while Production deployment is a separate step. A teammate checks the issue, diff, CI, and behavior, then requests fixes or approves. The author pushes fixes to the same branch. The designated merger uses **Create a merge commit** after human approval, successful CI, a current base, and no conflicts. Verify the develop Preview and record the result in the issue. AI review does not replace human approval.

## Conflict exercise (75–90 minutes)

```bash
npm run workshop:conflict:en
```

Follow the printed `cd` command to a separate temporary repository. Its `main` is an exercise baseline, not this project's release branch. Remove conflict markers in `src/config/chat.ts` and preserve both requirements:

```ts
export const CHAT_TITLE = "💬 Team Chat · Workshop room";
```

```bash
git add src/config/chat.ts
git commit -m "fix: preserve both chat title changes"
git status
git log --oneline --graph --all --decorate
```

A clean working tree and merged title confirm completion. Return to the original project afterward. For real feature conflicts, merge `origin/develop` into your working branch, resolve, run `npm run check`, push, and repeat review. Use `git merge --abort` to cancel an in-progress merge.

## Shared release and Production verification

1. At about 75 minutes, freeze feature integration and open **one shared PR: base `main`, compare `develop`**. Include the integrated issues and Preview verification. Each participant should not open a separate release PR.
2. While others practice conflicts, the release reviewer checks the diff, `workshop-ci`, and integration results, then approves. The reviewer must be someone other than the author.
3. After approval, passing CI, a current base, and no conflicts, merge with **Create a merge commit**, ideally around 85–90 minutes.
4. Check the **main push** Actions run for successful checks and deployment. Successful PR checks alone do not mean Production has deployed.
5. Refresh [Production](https://teamchat-jet.vercel.app), compare its footer SHA with the deployed main commit, and verify the UI improvements.
6. Confirm existing Production messages remain, exchange new messages between participants, and refresh to verify persistence. Keep the existing Redis connection and Production prefix.

PR merge, issue closure, deployment success, and browser verification are separate states. Report failures honestly; do not submit an older deployment as the new result.

## Submit evidence

- Issue and merged feature PR:
- PR you reviewed:
- Conflict resolution commit or explanation:
- Shared develop → main PR:
- Main push Actions run, Production URL, and deployed main SHA:
- Verified UI improvements, new shared messages, and history after refresh:
- Incomplete or unverified items:

## Delays and follow-up

At 50 minutes, reduce scope if needed and open small PRs. At 75 minutes, freeze develop and run release checks alongside conflict practice. Use the 20-minute buffer for authentication, CI, or deployment delays; finish within 120 minutes. Record paired participation separately from individual completion.

If shared chat fails, check the URL, room prefix, and backend connection. One working send button is insufficient evidence of shared chat. After the workshop, the facilitator propagates main's merge history back to develop with a sync PR. Separate release/hotfix branches are optional follow-up material; the [detailed facilitator plan](../git-github-workshop-plan.md) remains in Korean.
