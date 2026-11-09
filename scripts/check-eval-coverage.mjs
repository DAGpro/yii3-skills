#!/usr/bin/env node
// Validates and reports reference guide coverage across eval scenarios.
// Usage: node scripts/check-eval-coverage.mjs [--markdown]

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const referencesDir = join(root, 'skills', 'yii3', 'references');
const scenariosDir = join(root, 'evals', 'scenarios');

const allGuides = readdirSync(referencesDir)
  .filter((f) => f.endsWith('.md'))
  .sort();

const scenarios = readdirSync(scenariosDir)
  .filter((d) => statSync(join(scenariosDir, d)).isDirectory())
  .sort();

const scenarioData = new Map();
for (const s of scenarios) {
  const p = join(scenariosDir, s, 'scenario.json');
  if (!existsSync(p)) continue;
  scenarioData.set(s, JSON.parse(readFileSync(p, 'utf8')));
}

const guideMap = new Map();
for (const g of allGuides) {
  guideMap.set('references/' + g, []);
}
guideMap.set('SKILL.md', []);

for (const [sId, sMeta] of scenarioData) {
  for (const g of sMeta.guides || []) {
    if (guideMap.has(g)) {
      guideMap.get(g).push(sId);
    } else {
      console.error(`ERROR: Scenario "${sId}" references non-existent guide "${g}"`);
      process.exitCode = 1;
    }
  }
}

const totalGuides = allGuides.length; // 83
const specialCatalogs = ['references/INDEX.md', 'references/package-catalog.md'];
const topicGuides = allGuides.filter((g) => !specialCatalogs.includes('references/' + g));
const coveredTopicGuides = topicGuides.filter((g) => (guideMap.get('references/' + g) || []).length > 0);
const unboundTopicGuides = topicGuides.filter((g) => (guideMap.get('references/' + g) || []).length === 0);

const coveragePercent = ((coveredTopicGuides.length / topicGuides.length) * 100).toFixed(1);

console.log(`=== Reference Guide Coverage Report ===`);
console.log(`Total Reference Files: ${totalGuides}`);
console.log(`Catalogs & Navigation Indexes: ${specialCatalogs.length}`);
console.log(`Topic Guides Evaluated: ${topicGuides.length}`);
console.log(`Covered Guides: ${coveredTopicGuides.length} (${coveragePercent}%)`);
console.log(`Unbound Guides (Roadmap P3): ${unboundTopicGuides.length}`);
console.log(`Total Eval Scenarios: ${scenarios.length}`);

if (process.argv.includes('--markdown')) {
  console.log('\n## Unbound Guides (Roadmap P3):');
  for (const u of unboundTopicGuides) {
    console.log(`- \`references/${u}\``);
  }
}
