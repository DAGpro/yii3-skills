// Do-nothing floor measurement across all scenarios (meta-test tool, audit follow-up
// 2026-11-12). Grades an untouched fixture (no changes, empty transcript) in every
// scenario: with the attempt gate in place the gates verdict must FAIL everywhere
// (enforced permanently by the selftest floor control); the pass-rate shows how much
// of the check scale is still vacuous on an empty diff (35.2% mean before the gate,
// concentrated in the hygiene slice).
//
// Usage: node evals/audit/floor.mjs [--json]
//   exit 0 = gates FAIL on do-nothing in all scenarios; exit 1 = floor regression.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks, requiredFailed, passRate, listScenarios } from '../runner/core.mjs';
import { changedFiles } from '../lib/checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = process.argv.includes('--json');
const rows = [];

const work = mkdtempSync(join(tmpdir(), 'eval-floor-'));
try {
  for (const id of listScenarios(root)) {
    const sDir = join(root, 'scenarios', id);
    // A do-nothing attempt: fixture copy with nothing done (empty dir diff -> no changes).
    const ctx = { dir: work, base: join(sDir, 'fixture'), transcript: '', changed: [], mode: 'floor' };
    const results = await runChecks(sDir, ctx);
    const reqFailed = requiredFailed(results).map((r) => r.id);
    rows.push({ id, gatesPass: reqFailed.length === 0, reqFailed, rate: +passRate(results).toFixed(3) });
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const failedScenarios = rows.filter((r) => r.gatesPass);
const meanRate = rows.reduce((a, r) => a + r.rate, 0) / rows.length;

if (json) {
  console.log(JSON.stringify({ scenarios: rows.length, gatesFailOnDoNothing: rows.length - failedScenarios.length, meanPassRate: +meanRate.toFixed(3), rows }, null, 2));
} else {
  console.log('scenario                              gates  rate   required-failed');
  for (const r of rows) {
    console.log(`${r.id.padEnd(38)}${r.gatesPass ? 'PASS' : 'FAIL'}   ${(r.rate * 100).toFixed(1).padStart(5)}%  [${r.reqFailed.join(', ')}]`);
  }
  console.log(`\nscenarios: ${rows.length}  gates FAIL on do-nothing: ${rows.length - failedScenarios.length}  mean vacuous pass-rate: ${(meanRate * 100).toFixed(1)}%`);
}
process.exit(failedScenarios.length ? 1 : 0);
