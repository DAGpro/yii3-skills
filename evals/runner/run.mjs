#!/usr/bin/env node
// Usage: node evals/runner/run.mjs [--scenario 01-full-add-comment] [--mode both|with-skill|baseline] [--runs 3]
// CLI-agent spawn path. Agent-agnostic. Required env:
//   EVAL_AGENT_CMD   command that runs the agent: receives the prompt on stdin, must edit files in cwd.
// Optional env:
//   EVAL_SKILL_DEST  relative path where with-skill mode installs the skill package inside the work
//                    dir, matching whatever your agent uses for project skills (e.g. a dot-directory).
// cwd for the agent = temp copy of the fixture.
// No CLI agent at hand? Use evaluate.mjs: it grades a work dir you prepared by any means.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copyDir, listScenarios, loadScenario, evaluateWork } from './core.mjs';

const evalsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(evalsRoot, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const modes = args.mode && args.mode !== 'both' ? [args.mode] : ['with-skill', 'baseline'];
const runs = Number(args.runs ?? 3);
const agentCmd = process.env.EVAL_AGENT_CMD;
const skillDest = process.env.EVAL_SKILL_DEST;
const ids = args.scenario ? [args.scenario] : listScenarios(evalsRoot);

// --- scenario selection -------------------------------------------------
// --guides a.md,b.md  : scenarios bound to these skills/yii3/ paths
// --changed [git-ref] : scenarios bound to guide files changed vs the ref (default HEAD)
// --layer unit|composite : scenario layer filter
// Units always run before composites. --runs 0 gives a dry selection report.
const loadSc = (id) => loadScenario(join(evalsRoot, 'scenarios', id));
const toRepoPath = (g) => `skills/yii3/${g}`.replace(/\\/g, '/');
const changedFlag = process.argv.includes('--changed');
const changedRef = args.changed && !String(args.changed).startsWith('--') ? args.changed : 'HEAD';
const changedFiles = new Set();
if (changedFlag) {
  const g = spawnSync('git', ['diff', '--name-only', changedRef], { cwd: repoRoot, encoding: 'utf8' });
  if (g.status !== 0) {
    console.error(g.stderr.trim());
    process.exit(2);
  }
  for (const line of g.stdout.split('\n')) {
    const f = line.trim();
    if (f.startsWith('skills/yii3/')) changedFiles.add(f);
  }
}
const wantGuides = args.guides ? args.guides.split(',').map((s) => toRepoPath(s.trim())) : null;
const layer = args.layer && args.layer !== 'all' ? args.layer : null;
let selected = ids.filter((id) => {
  const sc = loadSc(id);
  if (layer && sc.layer !== layer) return false;
  const bound = (sc.guides ?? []).map(toRepoPath);
  if (wantGuides && !wantGuides.some((g) => bound.includes(g))) return false;
  if (changedFiles.size && !bound.some((b) => changedFiles.has(b))) return false;
  return true;
});
if (wantGuides || changedFlag || layer) {
  console.log(`selected ${selected.length} scenario(s): ${selected.join(', ') || '(none)'}`);
}
selected = selected
  .map((id) => ({ id, layer: loadSc(id).layer ?? 'unit' }))
  .sort((a, b) => (a.layer === 'composite') - (b.layer === 'composite'))
  .map((x) => x.id);
if (runs > 0) {
  if (!agentCmd) {
    console.error('EVAL_AGENT_CMD is required to spawn agents (prompt on stdin, cwd = fixture copy).');
    console.error('Set --runs 0 for a dry selection report.');
    process.exit(2);
  }
  if (modes.includes('with-skill') && !skillDest) {
    console.error('EVAL_SKILL_DEST is required for with-skill mode: relative path where the runner installs');
    console.error('the skill package inside the work dir, per your agent\'s project-skill location.');
    process.exit(2);
  }
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outRoot = join(evalsRoot, 'results', stamp);
const rows = [];

// Contamination canary: an agent that escaped its work dir (project-root misresolution,
// filesystem wander) leaves the source repo changed. Snapshot before spawning, compare after.
const repoState = () => {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  return `${head.stdout.trim()}|${st.stdout}`;
};
const repoBefore = repoState();
let contaminated = false;

// Agents resolve their own project root (.git discovery, recent-projects state); an
// unanchored temp dir lets them land somewhere else entirely (observed: one agent ran
// inside the harness repo and edited its scenario fixtures). So every work dir is
// prepared as an isolated git repo with a sandbox note.
const SANDBOX_NOTE = [
  '# Sandbox note',
  '',
  'This directory is an isolated copy of a project used for an evaluation run.',
  'Perform all work inside this directory; do not read, write, or search outside it.',
  '',
].join('\n');
const prepareWorkDir = (scenarioDir, work) => {
  copyDir(join(scenarioDir, 'fixture'), work);
  writeFileSync(join(work, 'AGENTS.md'), SANDBOX_NOTE);
  try {
    spawnSync('git', ['init', '-q'], { cwd: work });
    spawnSync('git', ['add', '-A'], { cwd: work });
    spawnSync('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@localhost', 'commit', '-q', '-m', 'fixture'], { cwd: work });
  } catch {
    // git missing: the sandbox note still anchors most agents
  }
};

for (const id of selected) {
  const sDir = join(evalsRoot, 'scenarios', id);
  const sc = loadScenario(sDir);
  const prompt = readFileSync(join(sDir, 'prompt.md'), 'utf8');
  for (const mode of modes) {
    for (let n = 1; n <= runs; n++) {
      // No scenario id in the dir name: it tells the agent it is inside an eval harness.
      const work = mkdtempSync(join(tmpdir(), 'yii3-eval-'));
      prepareWorkDir(sDir, work);
      if (mode === 'with-skill') copyDir(join(repoRoot, 'skills', 'yii3'), join(work, skillDest));
      const started = Date.now();
      const p = spawnSync(agentCmd, { shell: true, cwd: work, input: prompt, encoding: 'utf8', timeout: (sc.timeoutSec ?? 900) * 1000, maxBuffer: 64 * 1024 * 1024 });
      const transcript = `${p.stdout ?? ''}\n${p.stderr ?? ''}`;
      const repoTouched = repoState() !== repoBefore;
      if (repoTouched) {
        contaminated = true;
        console.error(`WARN: the source repository changed during the ${id} ${mode} #${n} agent run - the agent likely escaped its work dir. Inspect git status/log before trusting these results.`);
      }
      const { rate, reqFailed } = await evaluateWork(sDir, { dir: work, transcript, mode, run: n, outRoot, extra: { seconds: (Date.now() - started) / 1000, repoTouched } });
      rows.push({ id, layer: loadSc(id).layer ?? 'unit', mode, n, rate, reqFailed });
      console.log(`${id} ${mode} #${n}: ${(rate * 100).toFixed(0)}% required-failed=[${reqFailed}]`);
    }
  }
}

// summary.md: average pass-rate per scenario and mode + the with-skill - baseline delta
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
let md = '| scenario | layer | with-skill | baseline | delta |\n|---|---|---|---|---|\n';
for (const id of [...new Set(rows.map((r) => r.id))]) {
  const w = avg(rows.filter((r) => r.id === id && r.mode === 'with-skill').map((r) => r.rate));
  const b = avg(rows.filter((r) => r.id === id && r.mode === 'baseline').map((r) => r.rate));
  const f = (x) => (Number.isNaN(x) ? '-' : `${(x * 100).toFixed(0)}%`);
  md += `| ${id} | ${rows.find((r) => r.id === id)?.layer ?? '-'} | ${f(w)} | ${f(b)} | ${Number.isNaN(w - b) ? '-' : `${((w - b) * 100).toFixed(0)} pp`} |\n`;
}
mkdirSync(outRoot, { recursive: true });
writeFileSync(join(outRoot, 'summary.md'), md);
console.log(`\n${md}\nresults: ${outRoot}`);
if (contaminated) console.error('CONTAMINATION: at least one agent run changed the source repository - see the WARN lines above and inspect git status/log.');
process.exit(rows.some((r) => r.mode === 'with-skill' && r.reqFailed.length) ? 1 : 0);
