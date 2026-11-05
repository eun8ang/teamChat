import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { api, comments, eligible, escapeMarkdown, marker, ownComment, validateResult } from './pr-review-lib.mjs';

export async function publishReview({ original, metadata, outcome, raw, repository, runId }, client = { api, comments }) {
  if (metadata.number !== original.number || metadata.base !== original.base.sha || metadata.head !== original.head.sha) {
    throw new Error('Review metadata does not match this event');
  }
  let result;
  if (outcome === 'success') {
    if (Buffer.byteLength(raw) > 20000) throw new Error('Review result too large');
    result = validateResult(JSON.parse(raw), metadata.files);
  }
  const prior = (await client.comments(original.number)).find(ownComment);
  // Check as close to publication as possible; always display the reviewed SHA pair.
  const current = await client.api(`pulls/${original.number}`);
  if (!eligible(current, repository)
    || current.base.sha !== metadata.base || current.head.sha !== metadata.head) {
    console.log('Review superseded, draft or closed; publication skipped.');
    return false;
  }
  const complete = result?.status === 'complete' && metadata.excluded.length === 0;
  const state = !result ? '실패' : !complete ? '부분 검토' : result.findings.length ? '완료·지적 있음' : '완료·지적 없음';
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  const body = [marker,
    ...(complete ? [`<!-- reviewed:${metadata.base}:${metadata.head} -->`] : []),
    `### Claude PR 리뷰 — ${state}`,
    `base: \`${metadata.base}\` / head: \`${metadata.head}\``,
    `[실행 기록](${runUrl}) · AI 리뷰는 사람의 승인을 대신하지 않습니다.`,
    result ? escapeMarkdown(result.summary) : '분석이 완료되지 않았습니다. 실행 기록에서 설정·인증·예산·시간 제한을 확인한 뒤 재실행하세요.',
    ...((result?.findings ?? []).map(f => {
      const url = `https://github.com/${repository}/blob/${metadata.head}/${f.path}#L${f.line}`;
      return `- **${f.severity}** [${escapeMarkdown(f.path)}:${f.line}](${url}) — ${escapeMarkdown(f.description)}`;
    })),
    `검토 파일: ${Object.keys(metadata.files).length}개 / 제외: ${metadata.excluded.length}개`,
    ...([...new Set(metadata.excluded)].map(reason => `- 제외 사유: ${escapeMarkdown(reason)}`)),
  ].join('\n\n');
  if (body.length > 30000) throw new Error('Comment too large');
  await client.api(prior ? `issues/comments/${prior.id}` : `issues/${original.number}/comments`, {
    method: prior ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
  });

  return true;

}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await publishReview({
    original: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request,
    metadata: JSON.parse(readFileSync('.review/metadata.json', 'utf8')),
    outcome: process.env.ANALYSIS_OUTCOME,
    raw: readFileSync('.review/result.json', 'utf8'),
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
  });
}
