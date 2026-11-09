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
 * Normalizes token usage into { prompt, completion, total } or { total }.
 */
export function normalizeTokens(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && !Number.isNaN(val) && val >= 0) {
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
    if (!Number.isNaN(num) && num >= 0) {
      return { total: Math.round(num) };
    }
    return null;
  }
  if (typeof val === 'object') {
    const prompt = Number(val.prompt ?? val.prompt_tokens ?? val.input_tokens ?? val.input);
    const completion = Number(val.completion ?? val.completion_tokens ?? val.output_tokens ?? val.output);
    const explicitTotal = Number(val.total ?? val.total_tokens);

    const res = {};
    if (!Number.isNaN(prompt) && prompt >= 0) res.prompt = Math.round(prompt);
    if (!Number.isNaN(completion) && completion >= 0) res.completion = Math.round(completion);

    if (!Number.isNaN(explicitTotal) && explicitTotal >= 0) {
      res.total = Math.round(explicitTotal);
    } else if (res.prompt !== undefined && res.completion !== undefined) {
      res.total = res.prompt + res.completion;
    } else if (res.prompt !== undefined) {
      res.total = res.prompt;
    } else if (res.completion !== undefined) {
      res.total = res.completion;
    }

    return Object.keys(res).length > 0 && typeof res.total === 'number' ? res : null;
  }
  return null;
}

/**
 * Normalizes monetary cost into a floating-point USD amount.
 */
export function normalizeCost(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && !Number.isNaN(val) && val >= 0) {
    return Number(val.toFixed(6));
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/^\$/, '').trim();
    const num = Number(cleaned);
    if (!Number.isNaN(num) && num >= 0) {
      return Number(num.toFixed(6));
    }
  }
  return null;
}

/**
 * Extracts token usage and cost from transcript text using regex heuristics.
 */
export function extractTranscriptTelemetry(transcript) {
  if (!transcript || typeof transcript !== 'string') return {};
  const out = {};

  const usageMatch = transcript.match(/"usage"\s*:\s*\{([^}]+)\}/i);
  if (usageMatch) {
    try {
      const parsed = JSON.parse(`{${usageMatch[1]}}`);
      const tok = normalizeTokens(parsed);
      if (tok) out.tokens = tok;
    } catch {
      // ignore partial regex JSON error
    }
  }

  if (!out.tokens) {
    const promptMatch = transcript.match(/(?:prompt[_-]?tokens|input[_-]?tokens)\s*[:=]\s*(\d+)/i);
    const compMatch = transcript.match(/(?:completion[_-]?tokens|output[_-]?tokens)\s*[:=]\s*(\d+)/i);
    const totalMatch = transcript.match(/(?:total[_-]?tokens|total\s+tokens)\s*[:=]\s*(\d+)/i);

    const p = promptMatch ? Number(promptMatch[1]) : undefined;
    const c = compMatch ? Number(compMatch[1]) : undefined;
    const t = totalMatch ? Number(totalMatch[1]) : undefined;

    if (t !== undefined || p !== undefined || c !== undefined) {
      const tok = normalizeTokens({ prompt: p, completion: c, total: t });
      if (tok) out.tokens = tok;
    }
  }

  const costMatch = transcript.match(/(?:total[_-]?cost|cost)\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)/i);
  if (costMatch) {
    const parsedCost = normalizeCost(costMatch[1]);
    if (parsedCost !== null) out.cost = parsedCost;
  }

  return out;
}

/**
 * Extracts telemetry from files inside the work directory (tokens.json, usage.json, telemetry.json).
 */
export function extractFileTelemetry(dir) {
  if (!dir || !existsSync(dir)) return {};
  const candidates = ['tokens.json', 'usage.json', 'telemetry.json'];
  for (const f of candidates) {
    const full = join(dir, f);
    if (existsSync(full)) {
      try {
        const raw = JSON.parse(readFileSync(full, 'utf8'));
        const out = {};
        if (raw.tokens || raw.usage) {
          const tok = normalizeTokens(raw.tokens ?? raw.usage);
          if (tok) out.tokens = tok;
        } else {
          const tok = normalizeTokens(raw);
          if (tok) out.tokens = tok;
        }
        if (raw.cost !== undefined) {
          const cost = normalizeCost(raw.cost);
          if (cost !== null) out.cost = cost;
        }
        if (out.tokens || out.cost !== undefined) return out;
      } catch {
        // ignore malformed JSON file
      }
    }
  }
  return {};
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
    if (result.cost === undefined && fileTelem.cost !== undefined) result.cost = fileTelem.cost;
  }

  if (!result.tokens && process.env.EVAL_AGENT_TOKENS) {
    const envTok = normalizeTokens(process.env.EVAL_AGENT_TOKENS);
    if (envTok) result.tokens = envTok;
  }
  if (result.cost === undefined && process.env.EVAL_AGENT_COST) {
    const envCost = normalizeCost(process.env.EVAL_AGENT_COST);
    if (envCost !== null) result.cost = envCost;
  }

  if ((!result.tokens || result.cost === undefined) && transcript) {
    const tTelem = extractTranscriptTelemetry(transcript);
    if (!result.tokens && tTelem.tokens) result.tokens = tTelem.tokens;
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
    const runtimeResults = runRuntimeEvaluation(dir, changed);
    results.push(...runtimeResults);
  }
  const telemetry = extractTelemetry({ dir, transcript, extra });
  const runDir = join(outRoot, basename(scenarioDir), `${mode}-${run}`);
  mkdirSync(runDir, { recursive: true });
  const resultPayload = {
    id: basename(scenarioDir),
    mode,
    run,
    ...extra,
    ...telemetry,
    changed: changed.map((c) => c.path),
    results
  };
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(resultPayload, null, 2));
  if (transcript) writeFileSync(join(runDir, 'transcript.txt'), transcript);
  return {
    rate: passRate(results),
    reqFailed: requiredFailed(results).map((r) => r.id),
    results,
    tokens: telemetry.tokens,
    cost: telemetry.cost
  };
}
