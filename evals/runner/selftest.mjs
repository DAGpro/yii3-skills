#!/usr/bin/env node
// Validates the checks themselves: the positive sample must pass all required checks,
// the negative sample must fail every id listed in scenario.json -> negativeMustFail.
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir, listScenarios, loadScenario, runChecks, requiredFailed } from './core.mjs';
import { changedFiles } from '../lib/checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;

async function evalSample(id, sDir, kind) {
  const sample = join(sDir, `${kind}-sample`);
  const work = mkdtempSync(join(tmpdir(), `selftest-${id}-`));
  copyDir(join(sDir, 'fixture'), work);
  if (existsSync(sample)) copyDir(sample, work);
  const tPath = join(work, 'transcript.txt');
  const transcript = existsSync(tPath) ? readFileSync(tPath, 'utf8') : '';
  const ctx = { dir: work, base: join(sDir, 'fixture'), transcript, changed: changedFiles(work, join(sDir, 'fixture')).filter((c) => c.path !== 'transcript.txt'), mode: 'selftest' };
  return runChecks(sDir, ctx);
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
