// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { closeLinkedIssues, getDevelopPush, isMergedIntoDevelop, parseClosingIssues } from "../scripts/close-linked-issues.mjs";

const sha = "a".repeat(40);
const repository = "workshop/team-chat";
const env = {
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/develop",
  GITHUB_SHA: sha,
  GITHUB_REPOSITORY: repository,
  GITHUB_TOKEN: "test-token-never-print",
};
const event = { ref: env.GITHUB_REF, after: sha, deleted: false, repository: { full_name: repository } };
const pull = {
  number: 7,
  merged: true,
  state: "closed",
  merged_at: "2026-10-20T12:00:00Z",
  merge_commit_sha: sha,
  base: { ref: "develop", repo: { full_name: repository } },
  body: "Fixes #12",
};
const root = `https://api.github.com/repos/${repository}`;
const associatedPath = `/commits/${sha}/pulls?per_page=100`;

function fakeApi(entries: Record<string, unknown>) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input).replace(root, "")}`;
    if (!Object.hasOwn(entries, key)) throw new Error(`Unexpected request: ${key}`);
    const value = entries[key];
    if (value instanceof Error) throw value;
    if (value instanceof Response) return value;
    return Response.json(value);
  });
}

function mergedApi(extra: Record<string, unknown> = {}, body = pull.body) {
  return fakeApi({
    [`GET ${associatedPath}`]: [{ number: pull.number }],
    "GET /pulls/7": { ...pull, body },
    "GET /issues/12": { number: 12, state: "open" },
    "PATCH /issues/12": { number: 12, state: "closed" },
    ...extra,
  });
}

function writes(api: ReturnType<typeof fakeApi>) {
  return api.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

describe("closing reference parser", () => {
  it("accepts standalone same-repository references, deduplicates, and preserves order", () => {
    expect(parseClosingIssues("Fixes #12\r\nfixes: #12\r\nCLOSES #4\n  Resolves: #9  ")).toEqual([12, 4, 9]);
  });

  it("ignores prose, cross-repository links, lists, quotes, inline code, and indented code", () => {
    expect(parseClosingIssues([
      "This fixes #1", "Fixes #2 and #3", "Fixes workshop/other#4", "Fixes https://github.com/workshop/team-chat/issues/5",
      "- Fixes #6", "> Fixes #7", "`Fixes #8`", "    Fixes #9", "\tFixes #10", "Refs #11", "Fixes #0",
      "Fixes #01", "Fixes #-3", "Fixes #9007199254740992", "Fixes #12 trailing text",
    ].join("\n"))).toEqual([]);
  });

  it("ignores fenced examples, mismatched fences, and complete or unfinished HTML comments", () => {
    expect(parseClosingIssues([
      "````markdown", "Fixes #1", "```", "Fixes #2", "````", "~~~text", "Fixes #3", "```", "Fixes #4", "~~~",
      "<!-- Fixes #5 -->", "<!--", "Fixes #6", "-->", "Fixes <!--comment-->#7", "Fixes #8 <!--comment-->",
      "Fixes #9", "<!-- unfinished", "Fixes #10",
    ].join("\n"))).toEqual([9]);
  });

  it("treats HTML comment syntax inside fenced examples as literal code", () => {
    expect(parseClosingIssues("```html\n<!-- example\nFixes #1\n```\nFixes #2")).toEqual([2]);
  });

  it("handles missing bodies and fails on excessive references instead of truncating", () => {
    expect(parseClosingIssues(null)).toEqual([]);
    expect(parseClosingIssues(undefined)).toEqual([]);
    expect(() => parseClosingIssues(Array.from({ length: 21 }, (_, index) => `Fixes #${index + 1}`).join("\n")))
      .toThrow("At most 20 closing references");
  });
});

describe("develop merge eligibility", () => {
  it("requires a matching non-deleted develop push, valid nonzero SHA, and same repository", () => {
    expect(getDevelopPush(env, event)).toEqual({ repository, sha });
    for (const overrides of [
      { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_REF: "refs/heads/main" },
      { GITHUB_SHA: "0".repeat(40) }, { GITHUB_SHA: "not-a-sha" }, { GITHUB_REPOSITORY: "../other" },
    ]) expect(getDevelopPush({ ...env, ...overrides }, event)).toBeNull();
    for (const overrides of [
      { ref: "refs/heads/main" }, { after: "b".repeat(40) }, { deleted: true },
      { repository: { full_name: "somewhere/else" } }, { repository: { full_name: 12 } },
    ]) expect(getDevelopPush(env, { ...event, ...overrides })).toBeNull();
    expect(getDevelopPush(env, null)).toBeNull();
  });

  it("requires authoritative merged PR metadata and the exact merge-result SHA", () => {
    const context = { repository, sha };
    expect(isMergedIntoDevelop(pull, context)).toBe(true);
    for (const overrides of [
      { merged: false }, { state: "open" }, { merged_at: null }, { merged_at: "invalid" },
      { merge_commit_sha: "b".repeat(40) }, { base: { ref: "main", repo: { full_name: repository } } },
      { base: { ref: "develop", repo: { full_name: "someone/other" } } },
    ]) expect(isMergedIntoDevelop({ ...pull, ...overrides }, context)).toBe(false);
  });
});

describe("develop issue closure", () => {
  it("closes linked open issues as completed once using explicit token headers", async () => {
    const api = mergedApi({}, "Fixes #12\nFixes: #12");
    const log = vi.fn();
    await expect(closeLinkedIssues({ env, event, fetchImpl: api, log })).resolves.toMatchObject({ pullRequests: [7], closed: [12] });
    expect(writes(api)).toHaveLength(1);
    expect(writes(api)[0]).toEqual([`${root}/issues/12`, expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      headers: expect.objectContaining({ Authorization: `Bearer ${env.GITHUB_TOKEN}` }), redirect: "error",
    })]);
    expect(log.mock.calls.flat().join(" ")).not.toContain(env.GITHUB_TOKEN);
  });

  it("performs no API calls for an ineligible event, even without a token", async () => {
    const api = fakeApi({});
    await closeLinkedIssues({ env: { ...env, GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "" }, event, fetchImpl: api, log: vi.fn() });
    expect(api).not.toHaveBeenCalled();
  });

  it("ignores direct pushes and PRs merged into another base or with a different SHA", async () => {
    for (const invalidPull of [
      { ...pull, merged: false }, { ...pull, merge_commit_sha: "b".repeat(40) },
      { ...pull, base: { ref: "main", repo: { full_name: repository } } },
      { ...pull, base: { ref: "develop", repo: { full_name: "other/repo" } } },
    ]) {
      const api = mergedApi({ "GET /pulls/7": invalidPull });
      expect((await closeLinkedIssues({ env, event, fetchImpl: api, log: vi.fn() })).closed).toEqual([]);
      expect(api).toHaveBeenCalledTimes(2);
      expect(writes(api)).toHaveLength(0);
    }
    const api = fakeApi({ [`GET ${associatedPath}`]: [] });
    await closeLinkedIssues({ env, event, fetchImpl: api, log: vi.fn() });
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("uses current PR bodies, deduplicates associated PRs, and makes no writes without references", async () => {
    const api = mergedApi({
      [`GET ${associatedPath}`]: [{ ...pull, body: "Fixes #12" }, { number: 7 }],
      "GET /pulls/7": { ...pull, body: "Refs #12" },
    });
    await closeLinkedIssues({ env, event, fetchImpl: api, log: vi.fn() });
    expect(api).toHaveBeenCalledTimes(2);
    expect(writes(api)).toHaveLength(0);
  });

  it("skips already closed issues and references that point to pull requests", async () => {
    const api = mergedApi({
      "GET /issues/12": { number: 12, state: "closed" },
      "GET /issues/13": { number: 13, state: "open", pull_request: { url: "ignored" } },
    }, "Fixes #12\nFixes #13");
    await expect(closeLinkedIssues({ env, event, fetchImpl: api, log: vi.fn() }))
      .resolves.toMatchObject({ closed: [], alreadyClosed: [12], skippedPullRequests: [13] });
    expect(writes(api)).toHaveLength(0);
  });

  it("rejects excessive references before fetching issues or making writes", async () => {
    const body = Array.from({ length: 21 }, (_, index) => `Fixes #${index + 1}`).join("\n");
    const api = mergedApi({}, body);
    await expect(closeLinkedIssues({ env, event, fetchImpl: api, log: vi.fn() })).rejects.toThrow("At most 20");
    expect(api).toHaveBeenCalledTimes(2);
    expect(writes(api)).toHaveLength(0);
  });

  it("checks every linked issue before writes and reports safe API failures", async () => {
    const api = mergedApi({ "GET /issues/13": new Response("private response with test-token-never-print", { status: 403 }) }, "Fixes #12\nFixes #13");
    await expect(closeLinkedIssues({ env, event, fetchImpl: api, log: vi.fn() }))
      .rejects.toThrow(`GitHub API GET /repos/${repository}/issues/13 failed (HTTP 403).`);
    expect(writes(api)).toHaveLength(0);
    const networkApi = mergedApi({ [`GET ${associatedPath}`]: new Error(`network details ${env.GITHUB_TOKEN}`) });
    await expect(closeLinkedIssues({ env, event, fetchImpl: networkApi, log: vi.fn() }))
      .rejects.toThrow(`GitHub API GET /repos/${repository}/commits/${sha}/pulls?per_page=100 failed (network or timeout).`);
  });

  it("fails on missing credentials, excessive PR enumeration, and invalid issue metadata without writes", async () => {
    const api = mergedApi();
    await expect(closeLinkedIssues({ env: { ...env, GITHUB_TOKEN: "" }, event, fetchImpl: api, log: vi.fn() })).rejects.toThrow("GITHUB_TOKEN is required");
    expect(api).not.toHaveBeenCalled();
    const crowded = mergedApi({ [`GET ${associatedPath}`]: Array.from({ length: 100 }, (_, index) => ({ number: index + 1 })) });
    await expect(closeLinkedIssues({ env, event, fetchImpl: crowded, log: vi.fn() })).rejects.toThrow("Cannot safely enumerate");
    expect(writes(crowded)).toHaveLength(0);
    const invalid = mergedApi({ "GET /issues/12": { number: 13, state: "open" } });
    await expect(closeLinkedIssues({ env, event, fetchImpl: invalid, log: vi.fn() })).rejects.toThrow("invalid metadata for issue #12");
    expect(writes(invalid)).toHaveLength(0);
  });
});
