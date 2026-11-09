#!/usr/bin/env node
// Usage: node evals/runner/evaluate.mjs --scenario <id> --work <dir> [--transcript <file>] [--mode manual] [--run 1] [--out <stamp>]
// Agent-independent evaluation. No agent is spawned here: the work dir must start as a copy of the
// scenario fixture and already contain whoever did the task (a CLI agent, a chat agent, a human).
// The agent's final answer goes to the transcript (default: <work>/transcript.txt).
// Exit codes: 0 - all required checks passed, 1 - a required check failed, 2 - usage error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listScenarios, evaluateWork } from './core.mjs';
import { judgeSingleWork } from './judge.mjs';

const evalsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));

const fail = (msg) => { console.error(msg); process.exit(2); };

const id = args.scenario;
if (!id || !existsSync(join(evalsRoot, 'scenarios', id))) {
  fail(`--scenario is required and must exist. Available: ${listScenarios(evalsRoot).join(', ')}`);
}
const work = args.work ? resolve(args.work) : null;
if (!work || !existsSync(work)) fail('--work is required: the worked copy of the scenario fixture.');
const mode = args.mode ?? 'manual';
const run = Number(args.run ?? 1);
const stamp = args.out ?? new Date().toISOString().replace(/[:.]/g, '-');
const outRoot = join(evalsRoot, 'results', stamp);

const tPath = args.transcript ? resolve(args.transcript) : join(work, 'transcript.txt');
const transcript = existsSync(tPath) ? readFileSync(tPath, 'utf8') : '';
if (!transcript) console.error('WARN: no transcript found - transcript-based checks will fail.');

const runtime = process.argv.includes('--runtime') || args.runtime === 'true' || args.runtime === '1';
const judgeFlag = process.argv.includes('--judge') || args.judge === 'true' || args.judge === '1';
const dryRun = process.argv.includes('--dry-run') || args['dry-run'] === 'true';

const extra = { runtime };
if (args.tokens !== undefined) extra.tokens = args.tokens;
if (args.cost !== undefined) extra.cost = args.cost;

const { rate, reqFailed, results, tokens, cost } = await evaluateWork(join(evalsRoot, 'scenarios', id), { dir: work, transcript, mode, run, outRoot, extra });
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}${r.required ? '' : ' (opt)'} ${r.id}: ${r.evidence}`);
console.log(`pass-rate: ${(rate * 100).toFixed(0)}%  required-failed=[${reqFailed}]`);

if (tokens || cost !== undefined) {
  const parts = [];
  if (tokens) {
    const tokStr = typeof tokens === 'object' && tokens.total !== undefined
      ? `${tokens.total}${tokens.prompt !== undefined ? ` (prompt: ${tokens.prompt}, completion: ${tokens.completion})` : ''}`
      : JSON.stringify(tokens);
    parts.push(`tokens: ${tokStr}`);
  }
  if (cost !== undefined) {
    parts.push(`cost: $${cost}`);
  }
  console.log(`telemetry: ${parts.join('  ')}`);
}

if (judgeFlag) {
  try {
    const judgeResult = await judgeSingleWork({
      scenarioDir: join(evalsRoot, 'scenarios', id),
      workDir: work,
      transcript,
      options: { dryRun }
    });
    console.log(`judge-score: ${(judgeResult.score * 100).toFixed(0)}%  verdict=${judgeResult.verdict}`);
    writeFileSync(join(outRoot, id, `${mode}-${run}`, 'judge.json'), JSON.stringify(judgeResult, null, 2));
  } catch (jErr) {
    console.error(`judge-error: ${jErr.message}`);
  }
}

console.log(`artifacts: ${join(outRoot, id, `${mode}-${run}`)}`);
process.exit(reqFailed.length ? 1 : 0);
