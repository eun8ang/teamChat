## Related issue
Fixes #ISSUE_NUMBER

<!-- Read and apply .agents/skills/git-issue-pr/SKILL.md before generating any commit or PR text,
including drafts (Claude Code: /git-issue-pr). Use an English Conventional Commit PR title,
e.g. feat: add emoji picker (#12), with the actual issue number.
Feature/fix PRs target develop. Replace ISSUE_NUMBER above with an actual GitHub issue number.
Keep one standalone Fixes #NUMBER line for each issue this PR fully resolves.
For partial work or context, replace Fixes with Refs. Remove the placeholder line when there is no issue.
Never use CHAT catalog IDs or made-up issue numbers.
For the shared release PR, use base main / compare develop and follow the facilitator's instructions. -->

## Problem and outcome
What problem does this solve, and what can users do now?

## Changes
-

## Acceptance criteria and verification
- [ ] I verified the issue's acceptance criteria.
- [ ] I verified existing message sending and display behavior.
- [ ] I checked edge cases relevant to this change.

## Check results
<!-- Record pass/fail or "Not run" with a reason. npm run check runs all four checks. -->
- `npm run lint`:
- `npm run typecheck`:
- `npm run test:ci`:
- `npm run build`:
- Browser verification steps and results:

## Screenshots or reproduction steps
For UI changes, include screenshots. For behavior changes, describe the input, actions, and result.

## AI assistance and human verification
- AI-assisted work:
- What I verified myself:
- What remains unverified:

## Review request
- Reviewer: @TEAMMATE (also request a review using the Reviewers sidebar)
- Files or conditions that need particular attention:
- [ ] I checked the base and compare branches (feature/fix: base `develop`; shared release: base `main`, compare `develop`).
- [ ] The staged diff and Files changed contain only files relevant to this PR.

<!-- The develop push workflow verifies the merged PR and closes fully resolved Fixes issues as completed.
The workflow must already exist on develop. Refs does not request issue closure.
Issue closure means integrated into develop; Production release and deployment are separate.
Never include credentials or tokens in text, screenshots, or logs. A teammate must review;
AI feedback does not replace human approval. -->
