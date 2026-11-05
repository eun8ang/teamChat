import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { validateResult } from './pr-review-lib.mjs';

let result = null;
let outcome = 'failure';
try {
  if (process.env.ACTION_OUTCOME !== 'success') throw new Error('Analysis failed');
  const raw = process.env.REVIEW_RESULT || '';
  if (Buffer.byteLength(raw) > 20000) throw new Error('Result too large');
  const metadata = JSON.parse(readFileSync('.review/metadata.json', 'utf8'));
  result = validateResult(JSON.parse(raw), metadata.files);
  outcome = 'success';
} catch {
  // Do not log or persist rejected model output, which may contain sensitive text.
  console.log('Analysis failed or returned an invalid result; only failure metadata will be retained.');
}
writeFileSync('.review/result.json', JSON.stringify(result));
appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${outcome}\n`);
