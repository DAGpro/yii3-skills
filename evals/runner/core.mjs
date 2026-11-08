import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { changedFiles } from '../lib/checks.mjs';
import { runRuntimeEvaluation } from '../lib/runtime.mjs';

export const copyDir = (src, dst) => cpSync(src, dst, { recursive: true });

export function listScenarios(evalsRoot) {
  return readdirSync(join(evalsRoot, 'scenarios'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export const loadScenario = (dir) => JSON.parse(readFileSync(join(dir, 'scenario.json'), 'utf8'));

export async function runChecks(scenarioDir, ctx) {
  const mod = await import(pathToFileURL(join(scenarioDir, 'checks.mjs')).href);
  const out = [];
  for (const c of mod.default) {
    try {
      const r = await c.run(ctx);
      out.push({ id: c.id, description: c.description, required: c.required, pass: r.pass, evidence: r.evidence });
    } catch (e) {
      out.push({ id: c.id, description: c.description, required: c.required, pass: false, evidence: `exception: ${e.message}` });
    }
  }
  return out;
}

export const passRate = (results) =>
  results.length ? results.filter((r) => r.pass).length / results.length : 1;

export const requiredFailed = (results) => results.filter((r) => r.required && !r.pass);

/**
 * Evaluate a worked work dir against a scenario and persist artifacts.
 * Shared by run.mjs (agent spawn) and evaluate.mjs (external/manual runs):
 * the only inputs are a work dir that started as a fixture copy and a transcript.
 */
export async function evaluateWork(scenarioDir, { dir, transcript, mode, run = 1, outRoot, extra = {} }) {
  const base = join(scenarioDir, 'fixture');
  // transcript.txt is the agent's answer slot; AGENTS.md is the runner-owned sandbox note (run.mjs) - neither is task work.
  const changed = changedFiles(dir, base).filter((c) => c.path !== 'transcript.txt' && c.path !== 'AGENTS.md');
  const ctx = { dir, base, transcript, changed, mode };
  const results = await runChecks(scenarioDir, ctx);
  if (extra.runtime || process.env.EVAL_ENABLE_RUNTIME === '1') {
    const runtimeResults = runRuntimeEvaluation(dir, changed);
    results.push(...runtimeResults);
  }
  const runDir = join(outRoot, basename(scenarioDir), `${mode}-${run}`);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'result.json'), JSON.stringify({ id: basename(scenarioDir), mode, run, ...extra, changed: changed.map((c) => c.path), results }, null, 2));
  if (transcript) writeFileSync(join(runDir, 'transcript.txt'), transcript);
  return { rate: passRate(results), reqFailed: requiredFailed(results).map((r) => r.id), results };
}
