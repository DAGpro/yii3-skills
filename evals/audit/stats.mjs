// Paired-campaign statistics (audit P2/P3, meta-test tool): per-arm and per-scenario
// metrics with scenario-level bootstrap 95% CIs for the arm delta. Reads a campaign
// results directory: <results>/<scenario>/<arm>-<run>/result.json.
//
// Usage: node evals/audit/stats.mjs --results <dir> [--arms with-skill,baseline] [--iters 10000] [--json]
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
  console.error('Usage: node evals/audit/stats.mjs --results <dir> [--arms with-skill,baseline] [--iters 10000] [--json]');
  process.exit(2);
}
const arms = (arg('arms') ?? 'with-skill,baseline').split(',').map((s) => s.trim());
const iters = Math.max(100, Number(arg('iters', '10000')));
const json = process.argv.includes('--json');

// collect runs per arm per scenario
const data = {}; // arm -> scenario -> { rates: [], gates: [] }
for (const arm of arms) data[arm] = {};
for (const id of readdirSync(S).filter((d) => /^[0-9]/.test(d)).sort()) {
  const scDir = join(resultsDir, id);
  if (!existsSync(scDir)) continue;
  for (const run of readdirSync(scDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    // run dirs are `<arm>-<suffix>` (e.g. with-skill-1, main-set1-run2); match the arm by prefix
    const arm = arms.find((a) => run === a || run.startsWith(`${a}-`));
    if (!arm) continue;
    const f = join(scDir, run, 'result.json');
    if (!existsSync(f)) continue;
    const res = JSON.parse(readFileSync(f, 'utf8'));
    (data[arm][id] ??= { rates: [], gates: [] });
    data[arm][id].rates.push(passRate(res.results));
    data[arm][id].gates.push(requiredFailed(res.results).length === 0);
  }
}
const common = Object.keys(data[arms[0]]).filter((id) => data[arms[1]]?.[id]);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const perScenario = common.map((id) => {
  const layer = existsSync(join(S, id, 'scenario.json')) ? (loadScenario(join(S, id)).layer ?? 'unit') : 'unit';
  const row = { id, layer };
  for (const arm of arms) {
    row[arm] = { n: data[arm][id].rates.length, meanRate: mean(data[arm][id].rates), gatesShare: mean(data[arm][id].gates) };
  }
  row.deltaRate = row[arms[0]].meanRate - row[arms[1]].meanRate;
  return row;
});

// scenario-level bootstrap for the mean delta and per-arm means
const deltas = perScenario.map((r) => r.deltaRate);
const boot = (values) => {
  const out = [];
  for (let i = 0; i < iters; i++) {
    const sample = Array.from({ length: values.length }, () => values[Math.floor(Math.random() * values.length)]);
    out.push(mean(sample));
  }
  out.sort((a, b) => a - b);
  return { lo: out[Math.floor(iters * 0.025)], hi: out[Math.ceil(iters * 0.975) - 1], mean: mean(out) };
};
const deltaCi = deltas.length ? boot(deltas) : null;
const armCi = {};
for (const arm of arms) {
  const rates = perScenario.map((r) => r[arm].meanRate);
  armCi[arm] = rates.length ? boot(rates) : null;
}

if (!json) {
  console.log(`paired campaign: ${arms[0]} vs ${arms[1]}  (${common.length} shared scenarios, bootstrap ${iters} iters)`);
  console.log('scenario                              layer       ' + arms.map((a) => `${a}: mean/gates`).join('  |  ') + '  |  delta');
  for (const r of perScenario) {
    const cells = arms.map((a) => `${(r[a].meanRate * 100).toFixed(1)}%/${(r[a].gatesShare * 100).toFixed(0)}% (n=${r[a].n})`.padEnd(24)).join('  ');
    console.log(`${r.id.padEnd(38)}${r.layer.padEnd(11)} ${cells}  ${(r.deltaRate * 100).toFixed(1)} pp`);
  }
  if (deltaCi) {
    console.log(`\nmean of scenario deltas: ${(mean(deltas) * 100).toFixed(1)} pp  bootstrap 95% CI [${(deltaCi.lo * 100).toFixed(1)}; ${(deltaCi.hi * 100).toFixed(1)}] pp`);
    for (const arm of arms) {
      const ci = armCi[arm];
      console.log(`${arm}: mean of scenario means ${(ci.mean * 100).toFixed(1)}%  bootstrap 95% CI [${(ci.lo * 100).toFixed(1)}; ${(ci.hi * 100).toFixed(1)}]`);
    }
  }
  console.log('\nnote: n=1 per arm per scenario makes the CI degenerate - reruns are required before fine-grained conclusions.');
} else {
  console.log(JSON.stringify({ arms, scenarios: perScenario, deltaCi, armCi }, null, 2));
}
