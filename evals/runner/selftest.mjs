#!/usr/bin/env node
// Validates the checks themselves: the positive sample must pass all required checks,
// the negative sample must fail every id listed in scenario.json -> negativeMustFail.
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir, listScenarios, loadScenario, runChecks, requiredFailed, extractTelemetry } from './core.mjs';
import { changedFiles } from '../lib/checks.mjs';
import { runRuntimeEvaluation } from '../lib/runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFlag = process.argv.includes('--runtime');
let bad = 0;

// Validate telemetry extraction
try {
  const t1 = extractTelemetry({ extra: { tokens: '1500', cost: '$0.0045' } });
  if (t1.tokens?.total !== 1500 || t1.cost !== 0.0045) throw new Error(`t1 mismatch: ${JSON.stringify(t1)}`);

  const t2 = extractTelemetry({ extra: { tokens: '{"prompt":1200,"completion":300}' } });
  if (t2.tokens?.prompt !== 1200 || t2.tokens?.completion !== 300 || t2.tokens?.total !== 1500) {
    throw new Error(`t2 mismatch: ${JSON.stringify(t2)}`);
  }

  const transcript = 'Result summary: total_tokens: 2500\nCost: $0.0125\nCompleted successfully.';
  const t3 = extractTelemetry({ transcript });
  if (t3.tokens?.total !== 2500 || t3.cost !== 0.0125) throw new Error(`t3 mismatch: ${JSON.stringify(t3)}`);

  const tmpTelemDir = mkdtempSync(join(tmpdir(), 'telem-test-'));
  writeFileSync(join(tmpTelemDir, 'tokens.json'), JSON.stringify({ prompt: 800, completion: 200, cost: 0.003 }));
  const t4 = extractTelemetry({ dir: tmpTelemDir });
  if (t4.tokens?.total !== 1000 || t4.cost !== 0.003) throw new Error(`t4 mismatch: ${JSON.stringify(t4)}`);
} catch (e) {
  console.error(`FAIL telemetry-validation: ${e.message}`);
  bad++;
}

async function evalSample(id, sDir, kind) {
  const sample = join(sDir, `${kind}-sample`);
  const work = mkdtempSync(join(tmpdir(), `selftest-${id}-`));
  copyDir(join(sDir, 'fixture'), work);
  if (existsSync(sample)) copyDir(sample, work);
  const tPath = join(work, 'transcript.txt');
  const transcript = existsSync(tPath) ? readFileSync(tPath, 'utf8') : '';
  const changed = changedFiles(work, join(sDir, 'fixture')).filter((c) => c.path !== 'transcript.txt');
  const ctx = { dir: work, base: join(sDir, 'fixture'), transcript, changed, mode: 'selftest' };
  const checks = await runChecks(sDir, ctx);
  if (runtimeFlag && kind === 'positive') {
    const runtimeChecks = runRuntimeEvaluation(work, changed);
    checks.push(...runtimeChecks);
  }
  return checks;
}

for (const id of listScenarios(root)) {
  const sDir = join(root, 'scenarios', id);
  const sc = loadScenario(sDir);
  const missingGuides = (sc.guides ?? []).filter((g) => !existsSync(join(root, '..', 'skills', 'yii3', g)));
  const pos = await evalSample(id, sDir, 'positive');
  const posFailed = requiredFailed(pos);
  const neg = await evalSample(id, sDir, 'negative');
  const negFailedIds = neg.filter((r) => !r.pass).map((r) => r.id);
  const missing = (sc.negativeMustFail ?? []).filter((x) => !negFailedIds.includes(x));
  const okPos = posFailed.length === 0;
  const okNeg = missing.length === 0;
  const okGuides = missingGuides.length === 0;
  console.log(`${okPos && okNeg && okGuides ? 'OK  ' : 'FAIL'} ${id}  positive-required-failed=[${posFailed.map((r) => `${r.id}: ${r.evidence}`)}]  negative-not-caught=[${missing}]  guides-missing=[${missingGuides}]`);
  if (!okPos || !okNeg || !okGuides) bad++;
}
process.exit(bad ? 1 : 0);
