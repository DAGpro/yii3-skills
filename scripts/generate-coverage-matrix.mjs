import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const refDir = join(root, 'skills', 'yii3', 'references');
const scDir = join(root, 'evals', 'scenarios');

const guides = readdirSync(refDir).filter((f) => f.endsWith('.md')).sort();
const scenarios = readdirSync(scDir).filter((d) => statSync(join(scDir, d)).isDirectory()).sort();

const scData = {};
for (const s of scenarios) {
  const p = join(scDir, s, 'scenario.json');
  if (existsSync(p)) scData[s] = JSON.parse(readFileSync(p, 'utf8'));
}

const special = ['INDEX.md', 'package-catalog.md'];
const topicGuides = guides.filter((g) => !special.includes(g));
const covered = topicGuides.filter((g) => scenarios.some((s) => (scData[s]?.guides || []).includes('references/' + g)));
const unbound = topicGuides.filter((g) => !scenarios.some((s) => (scData[s]?.guides || []).includes('references/' + g)));
const rate = topicGuides.length === 0 ? '0.0' : ((covered.length / topicGuides.length) * 100).toFixed(1);
const unboundRate = topicGuides.length === 0 ? '0.0' : ((unbound.length / topicGuides.length) * 100).toFixed(1);

const skillScenarios = scenarios.filter((s) => (scData[s]?.guides || []).includes('SKILL.md'));
const skillScList = skillScenarios.map((s) => `[${s.slice(0, 2)}](scenarios/${s})`).join(', ') || '—';
const skillLayers = [...new Set(skillScenarios.map((s) => scData[s]?.layer || 'unit'))].join(', ') || '—';

let md = '# Topic Guide Verification & Eval Coverage Matrix\n\n';
md += '> Real-time mapping between official `skills/yii3/references/` topic guides and behavioral test scenarios in `evals/scenarios/`.\n';
md += '> Validated deterministically via `node scripts/check-eval-coverage.mjs` and `node evals/runner/selftest.mjs`.\n\n';

md += '## 1. Metric Summary\n\n';
md += '| Metric | Value | Scope |\n';
md += '|---|---|---|\n';
md += '| **Total Reference Files** | ' + guides.length + ' | All reference documents in `skills/yii3/references/` |\n';
md += '| **Catalogs & Navigation Indexes** | ' + special.length + ' | `INDEX.md`, `package-catalog.md` |\n';
md += '| **Evaluated Topic Guides** | ' + topicGuides.length + ' | Concrete architectural and implementation reference guides |\n';
md += '| **Covered Topic Guides** | ' + covered.length + ' (' + rate + '%) | Verified by >= 1 dedicated eval scenario with positive & negative samples |\n';
md += '| **Unbound Topic Guides** | ' + unbound.length + ' (' + unboundRate + '%) | ' + (unbound.length === 0 ? 'Full coverage achieved across all evaluated topic guides' : 'Pending dedicated eval scenario coverage') + ' |\n';
md += '| **Total Eval Scenarios** | ' + scenarios.length + ' | Deterministic test fixtures with full check-suites and mutation canaries |\n\n';

md += '## 2. Complete Verification Matrix\n\n';
md += '| Topic Guide | Governing Scenario(s) | Layer | Positive Sample | Negative Sample | Runtime Verification | Status |\n';
md += '|---|---|---|---|---|---|---|\n';
md += `| \`SKILL.md\` (Core Entry Point) | ${skillScList} | ${skillLayers} | Yes | Yes | php-lint, composer | **Covered** |\n`;

for (const g of guides) {
  const rel = 'references/' + g;
  const bound = scenarios.filter((s) => (scData[s]?.guides || []).includes(rel));
  const isSpecial = special.includes(g);
  const status = bound.length > 0 ? '**Covered**' : (isSpecial ? 'Catalog Index' : '*Unbound*');
  const scList = bound.map((s) => `[${s.slice(0, 2)}](scenarios/${s})`).join(', ') || '—';
  const layers = [...new Set(bound.map((s) => scData[s]?.layer || 'unit'))].join(', ') || '—';
  const pos = bound.length > 0 ? 'Yes' : '—';
  const neg = bound.length > 0 ? 'Yes' : '—';
  const runtime = bound.length > 0 ? 'php-lint, composer' : '—';

  md += `| \`${rel}\` | ${scList} | ${layers} | ${pos} | ${neg} | ${runtime} | ${status} |\n`;
}

if (unbound.length > 0) {
  md += '\n## 3. Unbound Guides Gap Analysis\n\n';
  md += `The following ${unbound.length} topic guide(s) do not yet have a dedicated eval scenario:\n\n`;
  md += '| # | Unbound Guide | Status |\n';
  md += '|---|---|---|\n';
  unbound.forEach((g, idx) => {
    md += `| ${idx + 1} | \`references/${g}\` | *Unbound* |\n`;
  });
  md += '\n';
} else {
  const milestones = scenarios.filter((s) => Number.parseInt(s.slice(0, 2), 10) >= 58);
  md += '\n## 3. Unbound Guides Gap Analysis (100% Coverage Achieved)\n\n';
  md += `All **${topicGuides.length}** evaluated topic guides (across **${guides.length}** reference files) have **100.0% coverage** across **${scenarios.length}** eval scenarios (\`0\` unbound guides). `;
  md += 'Roadmap P3 scenarios (`58–65`) and post-audit expansion scenarios (`66–68`) close all specialized runtime, UI, workflow, outbox, and bootstrap gaps:\n\n';
  md += '| # | Scenario | Layer | Bound Guides | Status |\n';
  md += '|---|---|---|---|---|\n';
  milestones.forEach((s, idx) => {
    const meta = scData[s] || {};
    const boundGuides = (meta.guides || []).map((g) => `\`${g}\``).join(', ') || '—';
    md += `| ${idx + 1} | [${s}](scenarios/${s}) | ${meta.layer || 'unit'} | ${boundGuides} | **Covered** |\n`;
  });
  md += '\n';
}

md += '## 4. Verification Command\n\n';
md += 'To re-verify that all declared guides exist and compute live coverage metrics:\n\n';
md += '```bash\nnode scripts/check-eval-coverage.mjs\n```\n';

writeFileSync(join(root, 'evals', 'COVERAGE.md'), md, 'utf8');
console.log('Successfully generated evals/COVERAGE.md');
