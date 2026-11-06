#!/usr/bin/env node
// Usage: node evals/runner/evaluate.mjs --scenario <id> --work <dir> [--transcript <file>] [--mode manual] [--run 1] [--out <stamp>]
// Agent-independent evaluation. No agent is spawned here: the work dir must start as a copy of the
// scenario fixture and already contain whoever did the task (a CLI agent, a chat agent, a human).
// The agent's final answer goes to the transcript (default: <work>/transcript.txt).
// Exit codes: 0 - all required checks passed, 1 - a required check failed, 2 - usage error.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listScenarios, evaluateWork } from './core.mjs';

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

const { rate, reqFailed, results } = await evaluateWork(join(evalsRoot, 'scenarios', id), { dir: work, transcript, mode, run, outRoot });
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}${r.required ? '' : ' (opt)'} ${r.id}: ${r.evidence}`);
console.log(`pass-rate: ${(rate * 100).toFixed(0)}%  required-failed=[${reqFailed}]`);
console.log(`artifacts: ${join(outRoot, id, `${mode}-${run}`)}`);
process.exit(reqFailed.length ? 1 : 0);
