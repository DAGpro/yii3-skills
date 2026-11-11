import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

/**
 * Normalizes a scenario check run result into the canonical shape:
 * status: 'passed' | 'failed' | 'skipped'. Skipped checks are never required and carry
 * pass: null - a skipped check is neither passed nor failed (audit fix: skip != pass).
 */
function normalizeCheckResult(c, r) {
  const skipped = r.skipped === true;
  return {
    id: c.id,
    description: c.description,
    category: c.category ?? 'invariant',
    required: skipped ? false : c.required !== false,
    status: skipped ? 'skipped' : r.pass ? 'passed' : 'failed',
    pass: skipped ? null : Boolean(r.pass),
    skipped,
    evidence: r.evidence ?? '',
  };
}

/** Normalizes a runtime-layer result (these are plain objects, not check() factories). */
function normalizeRuntimeResult(r) {
  const skipped = r.skipped === true;
  return {
    id: r.id,
    description: r.description,
    category: 'runtime',
    required: skipped ? false : r.required === true,
    status: skipped ? 'skipped' : r.pass ? 'passed' : 'failed',
    pass: skipped ? null : Boolean(r.pass),
    skipped,
    evidence: r.evidence ?? '',
    ...(r.summary ? { summary: r.summary } : {}),
  };
}

export async function runChecks(scenarioDir, ctx) {
  const mod = await import(pathToFileURL(join(scenarioDir, 'checks.mjs')).href);
  const out = [];
  // Attempt gate: an attempt that changed nothing scores zero. Hygiene checks
  // (no-yii2, strict-types, ...) pass vacuously on an empty diff, so without this
  // gate a do-nothing run would earn a passing rate on the cheap checks.
  out.push({
    id: 'attempt-gate',
    description: 'At least one file changed relative to the fixture (do-nothing attempts score zero)',
    category: 'protocol',
    required: true,
    status: ctx.changed.length > 0 ? 'passed' : 'failed',
    pass: ctx.changed.length > 0,
    skipped: false,
    evidence: ctx.changed.length > 0 ? `${ctx.changed.length} file(s) changed` : 'no files changed relative to the fixture',
  });
  for (const c of mod.default) {
    let r;
    try {
      r = await c.run(ctx);
    } catch (e) {
      r = { pass: false, evidence: `exception: ${e.message}` };
    }
    out.push(normalizeCheckResult(c, r));
  }
  return out;
}

/** Share of non-skipped checks that passed. Skipped checks are excluded from the denominator. */
export const passRate = (results) => {
  const counted = results.filter((r) => r.status !== 'skipped');
  return counted.length ? counted.filter((r) => r.status === 'passed').length / counted.length : 1;
};

/** Required checks that failed (the gates). Skipped checks are never required. */
export const requiredFailed = (results) => results.filter((r) => r.required && r.status === 'failed');

/** Gate verdict: pass only when every required check passed (headline metric, not a check-average). */
export const gatesPassed = (results) => requiredFailed(results).length === 0;

/** Hygiene slice (strict-types / no-yii2 class): cheap vacuous-on-empty checks, reported separately. */
export const hygieneStats = (results) => {
  const h = results.filter((r) => r.category === 'hygiene');
  return {
    total: h.length,
    passed: h.filter((r) => r.status === 'passed').length,
    failed: h.filter((r) => r.status === 'failed').length,
  };
};

const CHECKS_VERSION_FILES = ['lib/checks.mjs', 'lib/shared-checks.mjs', 'lib/runtime.mjs'];

/** Fingerprint of the grading logic (shared check libs + this scenario's checks.mjs). */
export function checksVersion(scenarioDir) {
  const evalsRoot = join(scenarioDir, '..', '..');
  const hash = createHash('sha1');
  for (const rel of CHECKS_VERSION_FILES) {
    const p = join(evalsRoot, rel);
    if (existsSync(p)) hash.update(rel).update(readFileSync(p));
  }
  const scenarioChecks = join(scenarioDir, 'checks.mjs');
  if (existsSync(scenarioChecks)) hash.update('scenario/checks.mjs').update(readFileSync(scenarioChecks));
  return hash.digest('hex').slice(0, 12);
}

/**
 * Merges two token objects, preserving existing defined values and computing total if possible.
 */
export function mergeTokens(target, source) {
  if (!source) return target ?? null;
  if (!target) return { ...source };
  const res = { ...target };
  if (res.prompt === undefined && source.prompt !== undefined) res.prompt = source.prompt;
  if (res.completion === undefined && source.completion !== undefined) res.completion = source.completion;
  if (res.total === undefined && source.total !== undefined) res.total = source.total;
  if (res.total === undefined && res.prompt !== undefined && res.completion !== undefined) {
    res.total = res.prompt + res.completion;
  }
  return res;
}

/**
 * Normalizes token usage into { prompt, completion, total }, { total }, or partial token usage.
 */
export function normalizeTokens(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
    return { total: Math.round(val) };
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('{')) {
      try {
        return normalizeTokens(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    const num = Number(trimmed);
    if (Number.isFinite(num) && num >= 0) {
      return { total: Math.round(num) };
    }
    return null;
  }
  if (typeof val === 'object') {
    const prompt = Number(val.prompt ?? val.prompt_tokens ?? val.input_tokens ?? val.input);
    const completion = Number(val.completion ?? val.completion_tokens ?? val.output_tokens ?? val.output);
    const explicitTotal = Number(val.total ?? val.total_tokens);

    const res = {};
    if (Number.isFinite(prompt) && prompt >= 0) res.prompt = Math.round(prompt);
    if (Number.isFinite(completion) && completion >= 0) res.completion = Math.round(completion);

    if (Number.isFinite(explicitTotal) && explicitTotal >= 0) {
      res.total = Math.round(explicitTotal);
    } else if (res.prompt !== undefined && res.completion !== undefined) {
      res.total = res.prompt + res.completion;
    }
    // Partial usage (prompt only or completion only) preserves partial fields without faking total

    return Object.keys(res).length > 0 ? res : null;
  }
  return null;
}

/**
 * Normalizes monetary cost into a floating-point USD amount.
 */
export function normalizeCost(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
    return Number(val.toFixed(6));
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/^\$/, '').trim();
    const num = Number(cleaned);
    if (Number.isFinite(num) && num >= 0) {
      return Number(num.toFixed(6));
    }
  }
  return null;
}

/**
 * Extracts token usage and cost from transcript text using regex heuristics.
 * Aggregates multiple usage/cost occurrences across tool calls or sub-steps.
 */
export function extractTranscriptTelemetry(transcript) {
  if (!transcript || typeof transcript !== 'string') return {};
  const out = {};

  // 1. JSON usage blocks (match all blocks to aggregate multi-step runs)
  const usageMatches = [...transcript.matchAll(/"usage"\s*:\s*\{([^}]+)\}/gi)];
  if (usageMatches.length > 0) {
    let aggTokens = null;
    let aggCost = null;
    let totalBlocks = 0;
    let promptBlocks = 0;
    let completionBlocks = 0;
    let totalOnlySum = 0;

    for (const match of usageMatches) {
      try {
        const parsed = JSON.parse(`{${match[1]}}`);
        const tok = normalizeTokens(parsed);
        if (tok) {
          totalBlocks++;
          if (!aggTokens) aggTokens = {};
          if (tok.prompt !== undefined) {
            promptBlocks++;
            aggTokens.prompt = (aggTokens.prompt ?? 0) + tok.prompt;
          }
          if (tok.completion !== undefined) {
            completionBlocks++;
            aggTokens.completion = (aggTokens.completion ?? 0) + tok.completion;
          }
          if (tok.total !== undefined && tok.prompt === undefined && tok.completion === undefined) {
            totalOnlySum += tok.total;
          }
        }
        const blockCost = normalizeCost(parsed.cost ?? parsed.total_cost);
        if (blockCost !== null) {
          aggCost = (aggCost ?? 0) + blockCost;
        }
      } catch {
        // ignore partial regex JSON error
      }
    }

    if (aggTokens && totalBlocks > 0) {
      if (promptBlocks === totalBlocks && completionBlocks === totalBlocks) {
        aggTokens.total = aggTokens.prompt + aggTokens.completion;
      } else if (promptBlocks === 0 && completionBlocks === 0 && totalOnlySum > 0) {
        aggTokens.total = totalOnlySum;
      }
      out.tokens = Object.keys(aggTokens).length > 0 ? aggTokens : null;
    }
    if (aggCost !== null) {
      out.cost = Number(aggCost.toFixed(6));
    }
  }

  // 2. Text-based token patterns if not already extracted from JSON usage
  if (!out.tokens) {
    const promptMatches = [...transcript.matchAll(/(?:prompt[_-]?tokens|input[_-]?tokens)\s*[:=]\s*(\d+)/gi)];
    const compMatches = [...transcript.matchAll(/(?:completion[_-]?tokens|output[_-]?tokens)\s*[:=]\s*(\d+)/gi)];
    const totalMatches = [...transcript.matchAll(/(?:total[_-]?tokens|total\s+tokens)\s*[:=]\s*(\d+)/gi)];

    const p = promptMatches.length > 0 ? promptMatches.reduce((acc, m) => acc + Number(m[1]), 0) : undefined;
    const c = compMatches.length > 0 ? compMatches.reduce((acc, m) => acc + Number(m[1]), 0) : undefined;
    const t = totalMatches.length > 0 ? totalMatches.reduce((acc, m) => acc + Number(m[1]), 0) : undefined;

    if (t !== undefined || p !== undefined || c !== undefined) {
      const tok = normalizeTokens({ prompt: p, completion: c, total: t });
      if (tok) out.tokens = tok;
    }
  }

  // 3. Cost from text if not extracted from JSON usage blocks
  if (out.cost === undefined) {
    const totalCostMatch = transcript.match(/(?:total[_-]?cost|total\s+cost)\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)/i);
    if (totalCostMatch) {
      const parsedCost = normalizeCost(totalCostMatch[1]);
      if (parsedCost !== null) out.cost = parsedCost;
    } else {
      const costMatches = [...transcript.matchAll(/(?:^|[^\w])cost\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)/gi)];
      if (costMatches.length > 0) {
        const sumCost = costMatches.reduce((acc, m) => acc + (normalizeCost(m[1]) ?? 0), 0);
        out.cost = Number(sumCost.toFixed(6));
      }
    }
  }

  return out;
}

/**
 * Extracts telemetry from files inside the work directory (tokens.json, usage.json, telemetry.json).
 * Merges token counts and cost across candidate files without losing metrics.
 */
export function extractFileTelemetry(dir) {
  if (!dir || !existsSync(dir)) return {};
  const candidates = ['tokens.json', 'usage.json', 'telemetry.json'];
  const out = {};

  for (const f of candidates) {
    const full = join(dir, f);
    if (existsSync(full)) {
      try {
        const raw = JSON.parse(readFileSync(full, 'utf8'));
        if (!out.tokens || out.tokens.total === undefined) {
          let fileTok = null;
          if (raw.tokens || raw.usage) {
            fileTok = normalizeTokens(raw.tokens ?? raw.usage);
          } else {
            fileTok = normalizeTokens(raw);
          }
          if (fileTok) {
            out.tokens = mergeTokens(out.tokens, fileTok);
          }
        }
        if (out.cost === undefined) {
          const rawCost = raw.cost ?? raw.total_cost ?? raw.usage?.cost ?? raw.tokens?.cost;
          if (rawCost !== undefined) {
            const cost = normalizeCost(rawCost);
            if (cost !== null) out.cost = cost;
          }
        }
        if (out.tokens?.total !== undefined && out.cost !== undefined) {
          break;
        }
      } catch {
        // ignore malformed JSON file
      }
    }
  }
  return out;
}

/**
 * Extracts and normalizes tokens and cost telemetry from options, files, env vars, or transcript.
 */
export function extractTelemetry({ dir = null, transcript = '', extra = {} } = {}) {
  const result = {};

  if (extra.tokens !== undefined && extra.tokens !== null) {
    const t = normalizeTokens(extra.tokens);
    if (t) result.tokens = t;
  }
  if (extra.cost !== undefined && extra.cost !== null) {
    const c = normalizeCost(extra.cost);
    if (c !== null) result.cost = c;
  }

  if ((!result.tokens || result.cost === undefined) && dir) {
    const fileTelem = extractFileTelemetry(dir);
    if (!result.tokens && fileTelem.tokens) result.tokens = fileTelem.tokens;
    else if (result.tokens && fileTelem.tokens) result.tokens = mergeTokens(result.tokens, fileTelem.tokens);
    if (result.cost === undefined && fileTelem.cost !== undefined) result.cost = fileTelem.cost;
  }

  if ((!result.tokens || result.cost === undefined) && process.env.EVAL_AGENT_TOKENS) {
    const envTok = normalizeTokens(process.env.EVAL_AGENT_TOKENS);
    if (!result.tokens && envTok) result.tokens = envTok;
    else if (result.tokens && envTok) result.tokens = mergeTokens(result.tokens, envTok);
  }
  if (result.cost === undefined && process.env.EVAL_AGENT_COST) {
    const envCost = normalizeCost(process.env.EVAL_AGENT_COST);
    if (envCost !== null) result.cost = envCost;
  }

  if ((!result.tokens || result.cost === undefined) && transcript) {
    const tTelem = extractTranscriptTelemetry(transcript);
    if (!result.tokens && tTelem.tokens) result.tokens = tTelem.tokens;
    else if (result.tokens && tTelem.tokens) result.tokens = mergeTokens(result.tokens, tTelem.tokens);
    if (result.cost === undefined && tTelem.cost !== undefined) result.cost = tTelem.cost;
  }

  return result;
}

/**
 * Evaluate a worked work dir against a scenario and persist artifacts.
 * Shared by run.mjs (agent spawn) and evaluate.mjs (external/manual runs):
 * the only inputs are a work dir that started as a fixture copy and a transcript.
 */
export async function evaluateWork(scenarioDir, { dir, transcript, mode, run = 1, outRoot, extra = {} }) {
  const base = join(scenarioDir, 'fixture');
  // transcript.txt is the agent's answer slot; AGENTS.md is the runner-owned sandbox note;
  // telemetry files (tokens.json, usage.json, telemetry.json) are telemetry slots - none are task work.
  const telemetryFiles = new Set(['transcript.txt', 'AGENTS.md', 'tokens.json', 'usage.json', 'telemetry.json']);
  const changed = changedFiles(dir, base).filter((c) => !telemetryFiles.has(c.path));
  const ctx = { dir, base, transcript, changed, mode };
  const results = await runChecks(scenarioDir, ctx);
  if (extra.runtime || process.env.EVAL_ENABLE_RUNTIME === '1') {
    results.push(...runRuntimeEvaluation(dir, changed).map(normalizeRuntimeResult));
  }
  const telemetry = extractTelemetry({ dir, transcript, extra });
  const runDir = join(outRoot, basename(scenarioDir), `${mode}-${run}`);
  mkdirSync(runDir, { recursive: true });
  const resultPayload = {
    id: basename(scenarioDir),
    mode,
    run,
    checksVersion: checksVersion(scenarioDir),
    ...extra,
    ...telemetry,
    changed: changed.map((c) => c.path),
    results
  };
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(resultPayload, null, 2));
  if (transcript) writeFileSync(join(runDir, 'transcript.txt'), transcript);
  return {
    rate: passRate(results),
    gatesPassed: gatesPassed(results),
    reqFailed: requiredFailed(results).map((r) => r.id),
    hygiene: hygieneStats(results),
    skippedCount: results.filter((r) => r.status === 'skipped').length,
    results,
    tokens: telemetry.tokens,
    cost: telemetry.cost
  };
}
