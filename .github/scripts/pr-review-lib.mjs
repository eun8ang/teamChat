import { execFileSync } from 'node:child_process';

export const marker = '<!-- claude-pr-review -->';
export const schema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'summary', 'findings'],
  properties: {
    status: { type: 'string', enum: ['complete', 'partial'] },
    summary: { type: 'string', maxLength: 2000 },
    findings: { type: 'array', maxItems: 5, items: {
      type: 'object', additionalProperties: false,
      required: ['severity', 'path', 'line', 'description'],
      properties: {
        severity: { type: 'string', enum: ['P1', 'P2', 'P3'] },
        path: { type: 'string' }, line: { type: 'integer', minimum: 1 },
        description: { type: 'string', maxLength: 2000 },
      },
    } },
  },
};

export function eligible(pr, repository) {
  return pr.state === 'open' && !pr.draft && pr.base.ref === 'develop'
    && pr.head.repo?.full_name === repository && pr.base.repo.full_name === repository
    && pr.user.type === 'User';
}

export function allowedPath(path) {
  return typeof path === 'string' && path.length <= 240
    && !path.split('/').some(part => !part || part === '.' || part === '..')
    && /^[\w./-]+$/.test(path)
    && !/(^|\/)(\.env[^/]*|node_modules|\.next|\.vercel|vendor|fixtures)(\/|$)/i.test(path)
    && !/(secret|credential|private.?key|certificate)/i.test(path)
    && (/^(src|tests|scripts)\/.*\.(tsx?|jsx?|mjs|css)$/.test(path)
      || /^\.github\/(workflows|scripts|prompts)\/.*\.(yml|yaml|mjs|md)$/.test(path)
      || /^(package(-lock)?\.json|tsconfig\.json|[^/]+\.config\.(ts|mjs)|AGENTS\.md|CLAUDE\.md)$/.test(path));
}

export function sensitive(text) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-ant-|gh[pousr]_|github_pat_)[\w-]{12,}|(?:password|api[_-]?key|token|secret|UPSTASH_REDIS_REST_(?:URL|TOKEN))["']?\s*[=:]\s*["'](?!\$|process\.|\{)[^"'\s]{8,}["']/i.test(text);
}

export function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function api(route, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${route}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', ...options.headers },
  });
  if (!response.ok) throw new Error(`GitHub API failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

export async function comments(number) {
  const result = [];
  for (let page = 1; ; page++) {
    const batch = await api(`issues/${number}/comments?per_page=100&page=${page}`);
    result.push(...batch);
    if (batch.length < 100) return result;
    if (page >= 50) throw new Error('Too many comments to check safely');
  }
}

export function ownComment(comment) {
  return comment.user?.id === 41898282 && comment.user?.login === 'github-actions[bot]'
    && comment.body?.startsWith(`${marker}\n`);
}

export function validateResult(result, files) {
  if (!result || Object.keys(result).sort().join() !== 'findings,status,summary'
    || !['complete', 'partial'].includes(result.status)
    || typeof result.summary !== 'string' || result.summary.length > 2000
    || !Array.isArray(result.findings) || result.findings.length > 5) throw new Error('Invalid review result');
  for (const finding of result.findings) {
    if (Object.keys(finding).sort().join() !== 'description,line,path,severity'
      || !['P1', 'P2', 'P3'].includes(finding.severity) || !allowedPath(finding.path)
      || !Number.isInteger(finding.line) || !files[finding.path]?.includes(finding.line)
      || typeof finding.description !== 'string' || !finding.description.length
      || finding.description.length > 2000) throw new Error('Invalid review finding');
  }
  if ([result.summary, ...result.findings.map(f => f.description)].some(sensitive)) throw new Error('Sensitive review output');
  return result;
}

export function changedLines(patch) {
  const lines = [];
  let line = 0;
  for (const text of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(text);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('\\')) continue;
    if (text.startsWith('+')) lines.push(line++);
    else if (text.startsWith(' ')) line++;
  }
  return lines;
}

export function escapeMarkdown(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}[\]()!|~])/g, '\\$1').replace(/@/g, '@\u200b');
}
