#!/usr/bin/env node
// Semantic LLM-as-a-Judge for Yii3 Eval Scenarios (Node >= 18, ESM, node:* stdlib only).
//
// Evaluates candidate solutions against prompt.md and rubric.md blindly (without
// knowing whether the run was 'with-skill' or 'baseline').
//
// Usage:
//   node evals/runner/judge.mjs --selftest
//   node evals/runner/judge.mjs --scenario <id> --work <dir> [--transcript <file>]
//   node evals/runner/judge.mjs --result-dir evals/results/<stamp>
//
// Environment / Providers:
//   EVAL_JUDGE_CMD       Shell command taking judge prompt on stdin, returning JSON on stdout.
//   OPENAI_API_KEY       Calls OpenAI-compatible /v1/chat/completions (model: EVAL_JUDGE_MODEL or gpt-4o).
//   ANTHROPIC_API_KEY    Calls Anthropic /v1/messages (model: EVAL_JUDGE_MODEL or claude-3-5-sonnet-latest).
//   GEMINI_API_KEY       Calls Google Gemini generateContent.
//   EVAL_JUDGE_DRY_RUN   1 | true — prints prompts and executes mock evaluation without external API calls.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { changedFiles, read, rel } from '../lib/checks.mjs';
import { listScenarios, loadScenario } from './core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '..');

// --- 1. Blind Prompt Builder ------------------------------------------------

/**
 * Builds the prompt for the LLM judge.
 * INVARIANT: Must be strictly blind — no mention of "with-skill", "baseline",
 * or the extension source repo is allowed into the judge prompt.
 */
export function buildJudgePrompt({ scenarioDir, dir, base, transcript }) {
  const promptText = existsSync(join(scenarioDir, 'prompt.md'))
    ? read(join(scenarioDir, 'prompt.md')).trim()
    : 'No prompt description provided.';

  const rubricText = existsSync(join(scenarioDir, 'rubric.md'))
    ? read(join(scenarioDir, 'rubric.md')).trim()
    : 'No rubric provided.';

  const ignoredInJudge = new Set(['transcript.txt', 'AGENTS.md', 'tokens.json', 'usage.json', 'telemetry.json']);
  const changed = changedFiles(dir, base).filter(
    (c) => !ignoredInJudge.has(c.path)
  );

  const fileSections = [];
  for (const f of changed) {
    if (existsSync(f.abs)) {
      try {
        const content = read(f.abs);
        // Truncate individual file if extremely large (> 64KB)
        const safeContent = content.length > 65536 ? content.slice(0, 65536) + '\n... [truncated]' : content;
        fileSections.push(`### File: ${f.path} (${f.added ? 'added' : 'modified'})\n\`\`\`php\n${safeContent}\n\`\`\``);
      } catch {
        fileSections.push(`### File: ${f.path} [unreadable binary or missing]`);
      }
    }
  }

  // Sanitize transcript: remove any mode markers (blind invariant)
  let cleanTranscript = (transcript || '').replace(/with-skill|baseline/gi, '[MODE_REDACTED]');

  const fullPrompt = [
    'You are an expert, impartial code evaluation judge for modern PHP and Yii 3 software engineering benchmarks.',
    '',
    '# INVARIANTS & EVALUATION RULES',
    '1. Blind evaluation: You do not know what tools, skills, or model variants the agent had access to. Grade strictly based on the provided diff/files, transcript, and rubric.',
    '2. Evidence-based: Every point awarded or deducted must cite concrete evidence (file names, code snippets, quotes).',
    '3. Strict Yii 3 standards: Yii 3 is decoupled and strict (PSR-7, PSR-11, PSR-14). No Yii 2 legacy facades (Yii::$app), no fat controllers, no SQL in HTTP actions.',
    '4. Output format: You MUST return ONLY a single valid JSON object matching the requested schema. No conversational prose or markdown formatting outside the JSON.',
    '',
    '# 1. TASK ASSIGNMENT PROMPT',
    promptText,
    '',
    '# 2. EVALUATION RUBRIC',
    rubricText,
    '',
    '# 3. CANDIDATE WORK',
    '## Modified / Created Files',
    fileSections.length > 0 ? fileSections.join('\n\n') : 'No files were created or modified.',
    '',
    '## Candidate Transcript / Final Response',
    cleanTranscript ? cleanTranscript : 'No transcript was produced.',
    '',
    '# 4. JSON RESPONSE SCHEMA',
    'Respond with a single JSON object structured as follows:',
    '{',
    '  "score": 0.95,',
    '  "verdict": "pass",',
    '  "summary": "1-2 sentence assessment",',
    '  "criteria": [',
    '    {',
    '      "criterion": "Name or text of criterion from rubric",',
    '      "status": "met",',
    '      "evidence": "Concrete evidence from submitted code or transcript"',
    '    }',
    '  ],',
    '  "strengths": ["...", "..."],',
    '  "weaknesses": ["..."]',
    '}',
    '',
    'Verdict must be one of: "pass" (score >= 0.8), "partial" (0.5 <= score < 0.8), or "fail" (score < 0.5).'
  ].join('\n');

  return fullPrompt;
}

// --- 2. JSON Response Parser & Validator ------------------------------------

export function parseJudgeResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty or non-string judge response');
  }

  // Extract JSON: handle ```json ... ``` or first { ... } block
  let jsonStr = rawText.trim();
  const fencedMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fencedMatch) {
    jsonStr = fencedMatch[1].trim();
  } else {
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }
  }

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Failed to parse judge JSON: ${err.message}\nRaw text:\n${rawText.slice(0, 500)}`);
  }

  if (typeof data.score !== 'number' || data.score < 0 || data.score > 1) {
    // Attempt normalisation if 0-100 scale was returned
    if (typeof data.score === 'number' && data.score > 1 && data.score <= 100) {
      data.score = data.score / 100;
    } else {
      data.score = 0;
    }
  }

  if (!['pass', 'partial', 'fail'].includes(data.verdict)) {
    data.verdict = data.score >= 0.8 ? 'pass' : data.score >= 0.5 ? 'partial' : 'fail';
  }

  if (!Array.isArray(data.criteria)) {
    data.criteria = [];
  }

  if (!Array.isArray(data.strengths)) data.strengths = [];
  if (!Array.isArray(data.weaknesses)) data.weaknesses = [];
  if (!data.summary) data.summary = 'Evaluation completed.';

  return data;
}

// --- 3. Judge Execution Engine ----------------------------------------------

export async function evaluateWithJudge(prompt, options = {}) {
  const isDryRun = options.dryRun || process.env.EVAL_JUDGE_DRY_RUN === '1' || process.env.EVAL_JUDGE_DRY_RUN === 'true';

  if (isDryRun) {
    return {
      score: 1.0,
      verdict: 'pass',
      summary: '[DRY RUN] Simulated judge response for dry-run validation.',
      criteria: [
        { criterion: 'Dry Run Criterion', status: 'met', evidence: 'Simulated evidence.' }
      ],
      strengths: ['Dry run pass'],
      weaknesses: []
    };
  }

  // 1. External Command via EVAL_JUDGE_CMD
  const judgeCmd = options.cmd || process.env.EVAL_JUDGE_CMD;
  if (judgeCmd) {
    const p = spawnSync(judgeCmd, {
      shell: true,
      input: prompt,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024
    });
    if (p.error) throw new Error(`Judge command failed: ${p.error.message}`);
    if (p.status !== 0) throw new Error(`Judge command exited with code ${p.status}: ${p.stderr}`);
    return parseJudgeResponse(p.stdout);
  }

  // 2. OpenAI API
  const openAiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = options.model || process.env.EVAL_JUDGE_MODEL || 'gpt-4o';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API call failed (${res.status}): ${errText}`);
    }
    const json = await res.json();
    return parseJudgeResponse(json.choices?.[0]?.message?.content);
  }

  // 3. Anthropic API
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = options.model || process.env.EVAL_JUDGE_MODEL || 'claude-3-5-sonnet-latest';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API call failed (${res.status}): ${errText}`);
    }
    const json = await res.json();
    return parseJudgeResponse(json.content?.[0]?.text);
  }

  throw new Error(
    'No LLM judge configured. Set EVAL_JUDGE_CMD, OPENAI_API_KEY, ANTHROPIC_API_KEY, or use --dry-run.'
  );
}

// --- 4. Workflow Operations -------------------------------------------------

export async function judgeSingleWork({ scenarioDir, workDir, transcript, options = {} }) {
  const base = join(scenarioDir, 'fixture');
  const tContent = transcript ?? (existsSync(join(workDir, 'transcript.txt')) ? read(join(workDir, 'transcript.txt')) : '');
  const prompt = buildJudgePrompt({ scenarioDir, dir: workDir, base, transcript: tContent });
  return await evaluateWithJudge(prompt, options);
}

export async function judgeResultDirectory(resultsDir, options = {}) {
  const absResults = resolve(resultsDir);
  if (!existsSync(absResults)) {
    throw new Error(`Results directory not found: ${absResults}`);
  }

  const reports = [];
  const scenarioDirs = readdirSync(absResults, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const sId of scenarioDirs) {
    const sPath = join(absResults, sId);
    const scenarioDefDir = join(root, 'scenarios', sId);
    if (!existsSync(scenarioDefDir)) continue;

    const runDirs = readdirSync(sPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const rName of runDirs) {
      const runDir = join(sPath, rName);
      const resFile = join(runDir, 'result.json');
      if (!existsSync(resFile)) continue;

      const tFile = join(runDir, 'transcript.txt');
      const transcript = existsSync(tFile) ? read(tFile) : '';

      console.log(`Judging ${sId} [${rName}]...`);
      try {
        const judgeResult = await judgeSingleWork({
          scenarioDir: scenarioDefDir,
          workDir: runDir,
          transcript,
          options
        });

        writeFileSync(join(runDir, 'judge.json'), JSON.stringify(judgeResult, null, 2));
        reports.push({
          scenario: sId,
          run: rName,
          score: judgeResult.score,
          verdict: judgeResult.verdict,
          summary: judgeResult.summary
        });
      } catch (err) {
        console.error(`  ERROR judging ${sId} [${rName}]: ${err.message}`);
      }
    }
  }

  // Compile judge-summary.md
  let summaryMd = '# LLM Judge Evaluation Summary\n\n';
  summaryMd += '| Scenario | Run / Mode | Score | Verdict | Summary |\n';
  summaryMd += '|---|---|---|---|---|\n';
  for (const rep of reports) {
    summaryMd += `| ${rep.scenario} | ${rep.run} | ${(rep.score * 100).toFixed(0)}% | **${rep.verdict}** | ${rep.summary.replace(/\|/g, '\\|')} |\n`;
  }

  writeFileSync(join(absResults, 'judge-summary.md'), summaryMd);
  console.log(`\nJudge summary written to: ${join(absResults, 'judge-summary.md')}`);
  return reports;
}

// --- 5. Self-Test Suite -----------------------------------------------------

export async function runSelfTest() {
  console.log('=== Running LLM Judge Self-Test ===\n');

  // Test 1: Blind Prompt Generation
  console.log('Test 1: Testing Blind Prompt Builder...');
  const testScDir = join(root, 'scenarios', '01-full-add-comment');
  const testPrompt = buildJudgePrompt({
    scenarioDir: testScDir,
    dir: join(testScDir, 'positive-sample'),
    base: join(testScDir, 'fixture'),
    transcript: 'Testing with-skill mode execution transcript.'
  });

  if (testPrompt.includes('with-skill') || testPrompt.includes('baseline')) {
    throw new Error('Blind evaluation invariant violated: mode was not redacted from prompt!');
  }
  if (!testPrompt.includes('TASK ASSIGNMENT PROMPT') || !testPrompt.includes('EVALUATION RUBRIC')) {
    throw new Error('Prompt structure is missing required sections!');
  }
  console.log('  PASS: Blind prompt sanitized and formatted correctly.');

  // Test 2: JSON Response Parser
  console.log('Test 2: Testing JSON Response Parser...');
  const sampleJson = `
\`\`\`json
{
  "score": 0.95,
  "verdict": "pass",
  "summary": "Excellent implementation meeting all rubric requirements.",
  "criteria": [
    { "criterion": "Bottom-up order", "status": "met", "evidence": "Ordered correctly." }
  ],
  "strengths": ["Clean DTO", "Reversible migration"],
  "weaknesses": []
}
\`\`\`
  `;
  const parsed = parseJudgeResponse(sampleJson);
  if (parsed.score !== 0.95 || parsed.verdict !== 'pass' || parsed.criteria.length !== 1) {
    throw new Error('Parser failed to parse valid fenced JSON!');
  }
  console.log('  PASS: Fenced JSON parsed and validated.');

  // Test 3: Normalization on 0-100 scale
  console.log('Test 3: Testing 0-100 score normalization...');
  const scaled = parseJudgeResponse('{"score": 90, "verdict": "pass"}');
  if (scaled.score !== 0.9) {
    throw new Error(`Normalization failed: expected 0.9, got ${scaled.score}`);
  }
  console.log('  PASS: 0-100 scale successfully normalized to 0.0-1.0.');

  // Test 4: Dry-Run Evaluation
  console.log('Test 4: Testing Dry-Run Evaluation Engine...');
  const dryResult = await evaluateWithJudge(testPrompt, { dryRun: true });
  if (dryResult.verdict !== 'pass' || dryResult.score !== 1.0) {
    throw new Error('Dry run failed to return mock pass result!');
  }
  console.log('  PASS: Dry-run evaluation returned valid evaluation structure.');

  console.log('\nAll LLM Judge self-tests passed successfully! (4/4 passed)');
  return true;
}

// --- 6. CLI Entry Point -----------------------------------------------------

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1] ?? true]] : a), [])
  );

  if (args.selftest || process.argv.includes('--selftest')) {
    await runSelfTest();
    process.exit(0);
  }

  const dryRun = args['dry-run'] || process.argv.includes('--dry-run');

  if (args['result-dir']) {
    await judgeResultDirectory(args['result-dir'], { dryRun });
    process.exit(0);
  }

  if (args.scenario) {
    const sId = args.scenario;
    const sDir = join(root, 'scenarios', sId);
    if (!existsSync(sDir)) {
      console.error(`Scenario not found: ${sId}`);
      process.exit(2);
    }
    const workDir = args.work ? resolve(args.work) : join(sDir, 'positive-sample');
    const result = await judgeSingleWork({
      scenarioDir: sDir,
      workDir,
      options: { dryRun }
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  node evals/runner/judge.mjs --selftest');
  console.log('  node evals/runner/judge.mjs --scenario <id> [--work <dir>] [--dry-run]');
  console.log('  node evals/runner/judge.mjs --result-dir evals/results/<timestamp> [--dry-run]');
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(`\n[FATAL] ${err.message}`);
    process.exit(1);
  });
}
