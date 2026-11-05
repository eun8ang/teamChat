import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { allowedPath, api, changedLines, comments, eligible, git, ownComment, schema, sensitive, writeReviewPrompt } from './pr-review-lib.mjs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const pr = event.pull_request;
const output = (name, value) => {
  const delimiter = randomUUID();
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
};
output('run', 'false');
if (!eligible(pr, process.env.GITHUB_REPOSITORY)) process.exit(0);
for (const actor of new Set([process.env.GITHUB_ACTOR, process.env.GITHUB_TRIGGERING_ACTOR])) {
  if (!actor || actor.endsWith('[bot]')) process.exit(0);
  const user = await api(`collaborators/${encodeURIComponent(actor)}/permission`);
  if (user.user?.type !== 'User' || !['admin', 'maintain', 'write'].includes(user.permission)) process.exit(0);
}
const key = `<!-- reviewed:${pr.base.sha}:${pr.head.sha} -->`;
if ((await comments(pr.number)).some(c => ownComment(c) && c.body.includes(key))) {
  console.log('Successful review for this base/head already exists.');
  process.exit(0);
}
// Fetch objects only. Never checkout or execute files supplied by the PR head.
process.env.GIT_CONFIG_COUNT = '1';
process.env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
process.env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64')}`;
for (const sha of [pr.base.sha, pr.head.sha]) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid commit SHA');
  git('fetch', '--no-tags', 'origin', sha);
}
delete process.env.GIT_CONFIG_COUNT;
delete process.env.GIT_CONFIG_KEY_0;
delete process.env.GIT_CONFIG_VALUE_0;
const mergeBase = git('merge-base', pr.base.sha, pr.head.sha).trim();
const paths = git('diff', '--name-only', '-z', mergeBase, pr.head.sha).split('\0').filter(Boolean);
const files = {};
const excluded = [];
const context = [];
let bytes = 0;
for (const path of paths) {
  // Do not transmit excluded paths: even a filename can contain private data.
  if (!allowedPath(path)) { excluded.push('unsupported or sensitive path'); continue; }
  if (Object.keys(files).length >= 30) { excluded.push('file count limit'); continue; }
  try {
    const mode = git('ls-tree', pr.head.sha, '--', path).split(' ')[0];
    if (!['100644', '100755'].includes(mode)) { excluded.push('deleted or non-regular file'); continue; }
    const patch = git('diff', '--no-ext-diff', '--no-textconv', '--unified=5', mergeBase, pr.head.sha, '--', path);
    const source = git('show', `${pr.head.sha}:${path}`);
    if (source.includes('\0') || sensitive(source) || sensitive(patch)) { excluded.push('binary or suspected secret'); continue; }
    const entry = JSON.stringify({ path, patch, head: source });
    const size = Buffer.byteLength(entry);
    if (size > 32 * 1024 || bytes + size > 200 * 1024) { excluded.push('context size limit'); continue; }
    files[path] = changedLines(patch);
    context.push(entry);
    bytes += size;
  } catch {
    excluded.push('file unavailable or too large');
  }
}
if (!Object.keys(files).length && !paths.some(allowedPath)) {
  console.log('Scope excluded: documentation or unsupported files only.');
  process.exit(0);
}
mkdirSync('.review', { recursive: true });
writeFileSync('.review/metadata.json', JSON.stringify({ number: pr.number, base: pr.base.sha, head: pr.head.sha, files, excluded }));
const instructions = readFileSync('.github/prompts/claude-pr-review.md', 'utf8');
const rules = ['AGENTS.md', 'CLAUDE.md'].map(p => `${p}:\n${readFileSync(p, 'utf8')}`).join('\n');
output('prompt', writeReviewPrompt('.review', `${instructions}\n\nTrusted base rules:\n${rules}\n\nExcluded scope: ${JSON.stringify(excluded)}\n\nUntrusted review data (JSON per file):\n${context.join('\n')}`));
output('schema', JSON.stringify(schema));
output('run', 'true');
