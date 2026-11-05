import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Workflow helpers run directly in Node without application dependencies.
import { allowedPath, changedLines, eligible, escapeMarkdown, ownComment, sensitive, validateResult, writeReviewPrompt } from '../.github/scripts/pr-review-lib.mjs';
import { publishReview } from '../.github/scripts/publish-pr-review.mjs';

describe('Claude review boundaries', () => {
  it('keeps large multilingual context out of Action input environment variables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'claude-review-'));
    try {
      const context = '한글 diff "quoted" \\path\n'.repeat(12000);
      expect(Buffer.byteLength(context)).toBeGreaterThan(200 * 1024);
      const prompt = writeReviewPrompt(directory, context);
      expect(readFileSync(join(directory, 'context.txt'), 'utf8')).toBe(context);
      // The action copies prompt to both PROMPT and JSON-serialized ALL_INPUTS.
      expect(Buffer.byteLength(prompt)).toBeLessThan(1024);
      expect(Buffer.byteLength(JSON.stringify({ prompt }))).toBeLessThan(2048);
      expect(prompt).not.toContain('한글');
      const workflow = readFileSync('.github/workflows/claude-pr-review.yml', 'utf8');
      expect(workflow).toContain('--append-system-prompt-file .review/context.txt');
      expect(workflow).toContain('--tools=');
      expect(workflow).toContain('path: .review/*.json');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('excludes unsafe paths and sensitive input', () => {
    for (const path of ['../src/a.ts', 'src/../a.ts', '/src/a.ts', 'src/a\n.ts', '.env.local', 'src/credentials.ts', 'node_modules/a.js']) {
      expect(allowedPath(path)).toBe(false);
    }
    expect(allowedPath('src/app/api/messages/route.ts')).toBe(true);
    expect(sensitive('api_key = "synthetic-secret-value"')).toBe(true);
    expect(sensitive('const token = process.env.TOKEN')).toBe(false);
  });

  it('only allows open internal non-draft PRs to develop', () => {
    const pr = { state: 'open', draft: false, user: { type: 'User' },
      base: { ref: 'develop', repo: { full_name: 'owner/repo' } },
      head: { repo: { full_name: 'owner/repo' } } };
    expect(eligible(pr, 'owner/repo')).toBe(true);
    expect(eligible({ ...pr, draft: true }, 'owner/repo')).toBe(false);
    expect(eligible({ ...pr, state: 'closed' }, 'owner/repo')).toBe(false);
    expect(eligible({ ...pr, head: { repo: { full_name: 'fork/repo' } } }, 'owner/repo')).toBe(false);
    expect(eligible({ ...pr, user: { type: 'Bot' } }, 'owner/repo')).toBe(false);
  });

  it('maps findings only to added head lines', () => {
    expect(changedLines('--- a\n+++ b\n@@ -4,3 +4,4 @@\n same\n-old\n+new\n+added\n last')).toEqual([5, 6]);
    const result = { status: 'complete', summary: '검토 완료', findings: [
      { severity: 'P2', path: 'src/a.ts', line: 5, description: '조건·영향·수정 방향' },
    ] };
    expect(validateResult(result, { 'src/a.ts': [5] })).toBe(result);
    expect(() => validateResult(result, { 'src/a.ts': [6] })).toThrow();
    expect(() => validateResult({ ...result, status: 'failed' }, { 'src/a.ts': [5] })).toThrow();
    expect(() => validateResult({ ...result, summary: 'api_key="synthetic-secret-value"' }, { 'src/a.ts': [5] })).toThrow();
    expect(() => validateResult({ ...result, extra: true }, { 'src/a.ts': [5] })).toThrow();
  });

  it('does not overwrite spoofed markers or render raw HTML and mentions', () => {
    const comment = { body: '<!-- claude-pr-review -->\ntext', user: { id: 41898282, login: 'github-actions[bot]' } };
    expect(ownComment(comment)).toBe(true);
    expect(ownComment({ ...comment, user: { id: 7, login: 'someone' } })).toBe(false);
    expect(escapeMarkdown('<img src=x> @team [link](https://example.com)')).toContain('&lt;img src=x&gt;');
    expect(escapeMarkdown('@team')).not.toContain('@team');
  });
});

describe('review publication', () => {
  const original = { number: 10, state: 'open', draft: false, user: { type: 'User' },
    base: { sha: 'a'.repeat(40), ref: 'develop', repo: { full_name: 'owner/repo' } },
    head: { sha: 'b'.repeat(40), repo: { full_name: 'owner/repo' } } };
  const metadata = { number: 10, base: original.base.sha, head: original.head.sha,
    files: { 'src/a.ts': [5] }, excluded: [] };
  const input = { original, metadata, outcome: 'success',
    raw: JSON.stringify({ status: 'complete', summary: '검토 완료', findings: [] }),
    repository: 'owner/repo', runId: '123' };

  it.each([
    { ...original, draft: true },
    { ...original, state: 'closed' },
    { ...original, head: { ...original.head, sha: 'c'.repeat(40) } },
    { ...original, base: { ...original.base, sha: 'c'.repeat(40) } },
  ])('suppresses superseded or inactive results', async current => {
    const client = { comments: vi.fn().mockResolvedValue([]), api: vi.fn().mockResolvedValue(current) };
    expect(await publishReview(input, client)).toBe(false);
    expect(client.api).toHaveBeenCalledTimes(1);
  });

  it('posts failure without accepting a model result or marking it successful', async () => {
    const client = { comments: vi.fn().mockResolvedValue([]), api: vi.fn().mockResolvedValue(original) };
    await publishReview({ ...input, outcome: 'failure', raw: 'invalid' }, client);
    const [route, options] = client.api.mock.calls[1];
    expect(route).toBe('issues/10/comments');
    const body = JSON.parse(options.body).body;
    expect(body).toContain('실패');
    expect(body).not.toContain('<!-- reviewed:');
  });

  it('creates a comment when a human has spoofed its marker', async () => {
    const client = { comments: vi.fn().mockResolvedValue([
      { id: 77, body: '<!-- claude-pr-review -->\n', user: { id: 7, login: 'human' } },
    ]), api: vi.fn().mockResolvedValue(original) };
    await publishReview(input, client);
    expect(client.api.mock.calls[1][0]).toBe('issues/10/comments');
  });

  it('updates its own comment and forces partial status for exclusions', async () => {
    const client = { comments: vi.fn().mockResolvedValue([
      { id: 88, body: '<!-- claude-pr-review -->\n', user: { id: 41898282, login: 'github-actions[bot]' } },
    ]), api: vi.fn().mockResolvedValue(original) };
    await publishReview({ ...input, metadata: { ...metadata, excluded: ['context size limit'] } }, client);
    const [route, options] = client.api.mock.calls[1];
    expect(route).toBe('issues/comments/88');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body).body).toContain('부분 검토');
    expect(JSON.parse(options.body).body).not.toContain('<!-- reviewed:');
  });

  it('blocks malformed output and mismatched event metadata before publication', async () => {
    const client = { comments: vi.fn(), api: vi.fn() };
    await expect(publishReview({ ...input, raw: '{}' }, client)).rejects.toThrow();
    await expect(publishReview({ ...input, metadata: { ...metadata, number: 11 } }, client)).rejects.toThrow();
    expect(client.api).not.toHaveBeenCalled();
  });
});
