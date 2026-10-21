# Team Chat Lab issue backlog

These 15 English issue bodies describe improvements that are missing from the current app. Each numbered Markdown file is a complete implementation prompt: copy the **entire issue body** into Codex or Claude Code from the repository workspace. It includes the current behavior, concrete scope, acceptance criteria, verification, and contribution rules. Only the assigned feature should be implemented.

`CHAT-01` through `CHAT-15` are local ticket identifiers, not GitHub issue numbers. Use the actual GitHub issue number in branch names and PR references after importing the files.

## Required commit and PR workflow

Before an assistant generates any commit message, PR title/body, or draft PR, it must read and apply [git-issue-pr](../../.agents/skills/git-issue-pr/SKILL.md) (Claude Code: `/git-issue-pr`). Use English Conventional Commit subjects and PR titles, such as `feat: add emoji picker (#12)` with the real issue number. A feature uses `feat` even though it resolves a GitHub issue.

For each fully resolved issue, include a standalone `Fixes #<actual-issue-number>` line in the PR body with base `develop`. Use `Refs #<actual-issue-number>` only for partial work or context. The [develop push workflow](../../.github/workflows/close-linked-issues.yml) verifies the actual merged PR and closes its resolved issues as completed. It must first be merged into `develop` before the workshop relies on it. GitHub's native closing keywords apply to default-branch merges; this workflow provides closure on `develop`. PR creation, an unmerged PR closure, feature-branch pushes, and `Refs` references do not trigger issue closure through it. Closure means integration into `develop`, while Production release and deployment remain separate.

## Choose a task

Times are implementation estimates for someone familiar with the stack and using a coding assistant; installation, Git practice, review, and integration take additional time. The larger features are optional extensions and are not all intended to fit into the 100-minute workshop.

| ID | Issue body | Level / session fit | Prerequisites |
| --- | --- | --- | --- |
| CHAT-01 | [Emoji picker](01-emoji-picker.md) | Intermediate / UI extension | None |
| CHAT-02 | [Online participant count](02-online-count.md) | Advanced / shared-state extension | None |
| CHAT-03 | [Online participants, most recent join first](03-online-participants.md) | Intermediate / after presence foundation | CHAT-02 |
| CHAT-04 | [Image attachments from local files](04-image-attachments.md) | Advanced / media extension | None |
| CHAT-05 | [Playable YouTube attachments](05-youtube-embeds.md) | Intermediate / media UI extension | None |
| CHAT-06 | [Edit and reset a profile image](06-profile-images.md) | Advanced / after image storage | CHAT-04 |
| CHAT-07 | [Shared single-choice polls](07-polls.md) | Advanced / shared-state extension | None |
| CHAT-08 | [Search loaded messages](08-message-search.md) | Intermediate / UI extension | None |
| CHAT-09 | [Shared emoji reactions](09-message-reactions.md) | Advanced / shared-state extension | None |
| CHAT-10 | [Reply to a message with a quote](10-message-replies.md) | Advanced / message contract extension | None |
| CHAT-11 | [Recover an unsent draft after refresh](11-draft-recovery.md) | Intermediate / UI extension | None |
| CHAT-12 | [Unread messages and jump to latest](12-unread-messages.md) | Advanced / scroll behavior extension | None |
| CHAT-13 | [Copy message text](13-copy-message.md) | Beginner / short workshop task | None |
| CHAT-14 | [Persistent light and dark themes](14-theme-switcher.md) | Intermediate / UI extension | None |
| CHAT-15 | [Visible loaded message count](15-loaded-message-count.md) | Beginner / short workshop task | None |

Each issue states its own detailed time estimate. Start beginners with CHAT-15 or CHAT-13. Choose one task per participant or pair and leave time for them to explain the diff and review another participant's PR.

## Create GitHub issues with the CLI

Run these commands from the repository root. Authenticate with GitHub CLI if necessary:

```bash
gh auth status
# Run only if authentication is needed:
gh auth login
```

Preview the 15 titles without creating issues:

```bash
for issue_file in docs/issues/[0-9][0-9]-*.md; do
  sed -n '1s/^# //p' "$issue_file"
done
```

Create a single issue first if desired:

```bash
issue_file="docs/issues/01-emoji-picker.md"
issue_title="$(sed -n '1s/^# //p' "$issue_file")"
gh issue create \
  --repo eun8ang/teamChat \
  --title "$issue_title" \
  --body-file "$issue_file"
```

To create all 15, run the following **once**, instead of the single-issue example. The first line of each file becomes its title; the complete file becomes its body. No labels, milestones, or assignees need to exist first.

```bash
for issue_file in docs/issues/[0-9][0-9]-*.md; do
  issue_title="$(sed -n '1s/^# //p' "$issue_file")"
  gh issue create \
    --repo eun8ang/teamChat \
    --title "$issue_title" \
    --body-file "$issue_file" || break
done
```

The command prints each created issue URL. It does not deduplicate issues: if a request fails or you already created one with the single-issue example, resume using only the remaining files. The loop deliberately excludes this README. For a fork, replace the repository argument with its owner and repository name.

Before assigning dependent tasks, add the actual prerequisite issue numbers to CHAT-03 and CHAT-06. Keep the local IDs as stable references. For example, after finding the presence issue number, add “Depends on #<actual-presence-issue-number>” to the roster issue body. Do not treat `CHAT-02` as GitHub issue `#2`.

## Assign and merge with limited overlap

- **Presence:** merge CHAT-02 before starting CHAT-03. Both use one Redis presence store, API, and hook. “Online” means recent visible-tab activity, and counts represent participant sessions rather than verified people. Display the shared state after polling; do not promise an instantaneous connection count.
- **Images:** merge CHAT-04 before starting CHAT-06. Profile editing reuses the bounded media upload and read API. This keeps the app on its existing storage stack without a new paid service.
- **Composer:** CHAT-01, CHAT-04, CHAT-10, and CHAT-11 share a small `MessageComposer` integration point. Sequence their integration and put each feature's logic in its own helper or component.
- **Message rendering:** CHAT-04, CHAT-05, CHAT-06, CHAT-09, CHAT-10, and CHAT-13 meet in `MessageBubble`. Keep media, reactions, profiles, reply quotes, and actions in focused components and integrate those PRs in order.
- **Message schema and persistence:** CHAT-04 and CHAT-10 add optional fields to the message contract. Serialize these merges, preserve older text-only records, and reconcile validation, serialization, and retry fingerprints together. The remaining UI tasks should keep that contract unchanged.
- **Search and scrolling:** CHAT-08 and CHAT-12 share `MessageList` and a small page integration. Preserve the canonical unfiltered message array, distinguish filtering from newly received messages, and coordinate their merge order. CHAT-15 always counts the canonical loaded list.
- **Styles:** use feature-scoped selectors. CHAT-14 touches more palette declarations than other tasks, so integrate it when the other style changes have settled and check both themes afterward.

Most tasks need a small page or prop connection; that is not a reason to refactor the whole page or message hook. Shared mutable features such as reactions, polls, and profiles require their own bounded synchronization: the existing `GET /api/messages?after=...` feed only delivers new messages, so it cannot by itself refresh changes to old messages or separate state.

## Participant handoff

1. Assign the actual GitHub issue and read its complete body. Check `AGENTS.md` and `CONTRIBUTING.md` in the checkout. Read and use `.agents/skills/git-issue-pr/SKILL.md` before any AI-generated commit or PR text, including drafts.
2. Start a new feature branch from the latest `origin/develop`. Use Node.js 24, `npm ci`, and the presenter's development Redis settings with your personal local prefix. Keep the current user's unrelated work intact.
3. Paste the entire issue into the coding assistant. Inspect the implementation, test it, and run `npm run check`. Record any skipped checks honestly. Browser acceptance checks for shared features require two independent participant sessions using the **same development room prefix**; never point local experiments at Production.
4. Explain the change, commit and push the selected files, and open a PR with base `develop`. Apply the skill's Conventional Commit rules to the commit subject and PR title. Include a standalone `Fixes #<actual-issue-number>` for a fully resolved issue and the validation evidence; use `Refs` for partial work or context.
5. Have another person review the change and follow the presenter's merge procedure. AI feedback does not replace that person's approval. Verify the integrated feature in Preview and check the develop push workflow's issue-closure result. Follow the separate workshop release process for Production on `main`.

The prompts keep implementation and local checks within one task. Publishing a branch or PR, merging, and deployment are participant actions unless they explicitly ask their assistant to perform them. No GitHub issues are created by adding these Markdown files to the repository.
