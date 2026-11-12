// Calibration policy application (audit P2/P3, meta-test tool).
// The suite's own policy (evals/README.md): a scenario whose BASELINE mean pass-rate
// stays >= threshold (default 80%) measures instruction-following, not skill effect -
// it must be hardened (indirect prompt, distractors, extra gates) or retired.
// Reads a baseline campaign results directory:
//   <results>/<scenario>/<mode>-<run>/result.json
//
// Usage: node evals/audit/calibration.mjs --results <dir> [--mode baseline-manual-chat] [--threshold 0.8] [--json]
//   exit 0 always (report tool).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenario, passRate, requiredFailed } from '../runner/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const S = join(root, 'scenarios');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const resultsDir = arg('results');
if (!resultsDir || !existsSync(resultsDir)) {
  console.error('Usage: node evals/audit/calibration.mjs --results <dir> [--mode <mode>] [--threshold 0.8] [--json]');
  process.exit(2);
}
const mode = arg('mode');
const threshold = Number(arg('threshold', '0.8'));
const json = process.argv.includes('--json');

const rows = [];
for (const id of readdirSync(S).filter((d) => /^[0-9]/.test(d)).sort()) {
  const scDir = join(resultsDir, id);
  if (!existsSync(scDir)) continue;
  const runDirs = readdirSync(scDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (!mode || d.name.startsWith(`${mode}-`)))
    .map((d) => d.name);
  const runs = [];
  for (const r of runDirs) {
    const f = join(scDir, r, 'result.json');
    if (!existsSync(f)) continue;
    const res = JSON.parse(readFileSync(f, 'utf8'));
    runs.push({ rate: passRate(res.results), gatesPass: requiredFailed(res.results).length === 0 });
  }
  if (!runs.length) continue;
  const layer = existsSync(join(S, id, 'scenario.json')) ? (loadScenario(join(S, id)).layer ?? 'unit') : 'unit';
  const meanRate = runs.reduce((a, r) => a + r.rate, 0) / runs.length;
  const gatesShare = runs.filter((r) => r.gatesPass).length / runs.length;
  rows.push({ id, layer, runs: runs.length, meanRate, gatesShare, over: meanRate >= threshold });
}

const flagged = rows.filter((r) => r.over);
if (!json) {
  console.log('scenario                              layer      runs  mean-rate  gates  verdict');
  for (const r of rows) {
    console.log(`${r.id.padEnd(38)}${r.layer.padEnd(10)}${String(r.runs).padStart(4)}   ${(r.meanRate * 100).toFixed(1).padStart(8)}%  ${(r.gatesShare * 100).toFixed(0).padStart(4)}%  ${r.over ? 'HARDEN OR RETIRE' : 'ok'}`);
  }
  console.log(`\ncalibration (threshold ${(threshold * 100).toFixed(0)}% baseline mean): ${flagged.length} of ${rows.length} measured scenarios flagged`);
  for (const r of flagged) console.log(`  HARDEN OR RETIRE: ${r.id} (${r.layer}, ${(r.meanRate * 100).toFixed(1)}%)`);
} else {
  console.log(JSON.stringify({ threshold, flagged: flagged.map((r) => r.id), rows }, null, 2));
}
