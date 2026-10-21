import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MAX_ISSUES = 20;
const SHA_PATTERN = /^(?!0{40}$)[a-f0-9]{40}$/i;
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const sameRepository = (value, repository) =>
  typeof value === "string" && value.toLowerCase() === repository.toLowerCase();

// Only explicit, standalone lines count. Examples, comments, lists, quoted text,
// cross-repository references, and prose must never accidentally close issues.
export function parseClosingIssues(body, limit = MAX_ISSUES) {
  if (typeof body !== "string") return [];
  const numbers = new Set();
  let fence;
  let inComment = false;
  for (const rawLine of body.split(/\r?\n/)) {
    if (fence) {
      const marker = rawLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker && marker[1][0] === fence.character &&
          marker[1].length >= fence.length && marker[2].trim() === "") {
        fence = undefined;
      }
      continue;
    }
    let line = "";
    let position = 0;
    // A comment makes its entire source line ineligible. Process comments only
    // outside fenced code, where an example's "<!--" is just literal text.
    while (position < rawLine.length) {
      const marker = rawLine.indexOf(inComment ? "-->" : "<!--", position);
      if (marker < 0) {
        line += inComment ? "\0" : rawLine.slice(position);
        break;
      }
      line += (inComment ? "" : rawLine.slice(position, marker)) + "\0";
      position = marker + (inComment ? 3 : 4);
      inComment = !inComment;
    }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    const match = line.match(/^ {0,3}(?:fixes|closes|resolves):?[ \t]+#([1-9]\d*)[ \t]*$/i);
    const number = match ? Number(match[1]) : 0;
    if (positiveInteger(number)) numbers.add(number);
    if (numbers.size > limit) throw new Error(`At most ${limit} closing references are allowed.`);
  }
  return [...numbers];
}

export function getDevelopPush(env, event) {
  const repository = env.GITHUB_REPOSITORY;
  const sha = env.GITHUB_SHA;
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/develop" ||
      event?.ref !== "refs/heads/develop" || event.deleted !== false ||
      typeof sha !== "string" || !SHA_PATTERN.test(sha) || event.after !== sha ||
      typeof repository !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository) ||
      !sameRepository(event.repository?.full_name, repository)) {
    return null;
  }
  return { repository, sha };
}

export function isMergedIntoDevelop(pullRequest, context) {
  return pullRequest?.merged === true && pullRequest.state === "closed" &&
    typeof pullRequest.merged_at === "string" && Number.isFinite(Date.parse(pullRequest.merged_at)) &&
    pullRequest.base?.ref === "develop" &&
    sameRepository(pullRequest.base.repo?.full_name, context.repository) &&
    pullRequest.merge_commit_sha === context.sha;
}

/**
 * @param {{ env?: Record<string, string | undefined>, event?: unknown,
 * fetchImpl?: typeof fetch, log?: (message: string) => void }} options
 */
export async function closeLinkedIssues({ env = process.env, event, fetchImpl = fetch, log = console.log } = {}) {
  const context = getDevelopPush(env, event);
  if (!context) {
    log("No eligible develop push; no issues changed.");
    return { pullRequests: [], closed: [], alreadyClosed: [], skippedPullRequests: [] };
  }
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required to close linked issues.");
  let apiUrl;
  try {
    apiUrl = new URL(env.GITHUB_API_URL || "https://api.github.com");
  } catch {
    throw new Error("GITHUB_API_URL is not a valid API URL.");
  }
  if (apiUrl.protocol !== "https:" || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
    throw new Error("GITHUB_API_URL must be an HTTPS API URL without credentials or query parameters.");
  }
  const apiBase = apiUrl.href.replace(/\/$/, "");
  const repoPath = `/repos/${context.repository}`;
  async function request(path, method = "GET", body) {
    let response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(`GitHub API ${method} ${path} failed (network or timeout).`);
    }
    if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed (HTTP ${response.status}).`);
    try {
      return await response.json();
    } catch {
      throw new Error(`GitHub API ${method} ${path} returned invalid JSON.`);
    }
  }

  const associated = await request(`${repoPath}/commits/${context.sha}/pulls?per_page=100`);
  if (!Array.isArray(associated) || associated.length >= 100) {
    throw new Error("Cannot safely enumerate the pull requests associated with this commit.");
  }
  const result = { pullRequests: [], closed: [], alreadyClosed: [], skippedPullRequests: [] };
  const issueNumbers = new Set();
  const pullNumbers = [...new Set(associated.map((pull) => pull?.number))];
  for (const number of pullNumbers) {
    if (!positiveInteger(number)) throw new Error("GitHub returned an invalid pull request number.");
    // Fetch current authoritative metadata; do not trust a list item's body.
    const pull = await request(`${repoPath}/pulls/${number}`);
    if (pull?.number !== number || !isMergedIntoDevelop(pull, context)) continue;
    result.pullRequests.push(number);
    for (const issueNumber of parseClosingIssues(pull.body)) issueNumbers.add(issueNumber);
    if (issueNumbers.size > MAX_ISSUES) throw new Error(`At most ${MAX_ISSUES} closing references are allowed.`);
  }

  // Finish validation before making any writes. Pull requests share the issue
  // number space but must never be closed through the issues endpoint.
  const toClose = [];
  for (const number of issueNumbers) {
    const issue = await request(`${repoPath}/issues/${number}`);
    if (issue?.number !== number) throw new Error(`GitHub returned invalid metadata for issue #${number}.`);
    if (Object.hasOwn(issue, "pull_request")) result.skippedPullRequests.push(number);
    else if (issue.state === "closed") result.alreadyClosed.push(number);
    else if (issue.state === "open") toClose.push(number);
    else throw new Error(`GitHub returned an invalid state for issue #${number}.`);
  }
  for (const number of toClose) {
    await request(`${repoPath}/issues/${number}`, "PATCH", { state: "closed", state_reason: "completed" });
    result.closed.push(number);
  }
  log(`Verified ${result.pullRequests.length} merged PR(s); closed ${result.closed.length} issue(s); ` +
    `${result.alreadyClosed.length} already closed; ${result.skippedPullRequests.length} PR reference(s) skipped.`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let event;
    try {
      event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    } catch {
      throw new Error("Cannot read valid GitHub event JSON from GITHUB_EVENT_PATH.");
    }
    await closeLinkedIssues({ event });
  } catch (error) {
    // Only locally constructed errors are emitted; API response bodies, the PR
    // body, and the token are never printed.
    console.error(error instanceof Error ? error.message : "Issue closure failed.");
    process.exitCode = 1;
  }
}
