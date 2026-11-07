import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

// Guide persistence-cycle-orm.md §3.1 (CRITICAL): persist()/delete() only STAGE operations in
// memory - nothing is written until ->run() executes the Unit of Work. §5.2 documents
// EntityWriter::write() as the batch equivalent ("Calls persist() on each entity followed by
// a single transactional run()").
const stagesEntity = (t) =>
  /->\s*persist\s*\(/.test(t) || (/\bEntityWriter\b/.test(t) && /->\s*write\s*\(/.test(t));

// Order-sensitive: in the fixed file, ->run() must appear AFTER the persist() staging call
// (executing a Unit of Work before staging anything is still the §3.1 bug).
const persistThenRun = (t) => {
  const k = t.search(/->\s*persist\s*\(/);
  return k !== -1 && /->\s*run\s*\(/.test(t.slice(k));
};

const executesUnitOfWork = (t) =>
  (/\bEntityWriter\b/.test(t) && /->\s*write\s*\(/.test(t)) || persistThenRun(t);

export default [
  check('run-called-after-persist', 'The fix executes the Unit of Work: ->run() appears AFTER ->persist() in the same changed src file (Cycle guide §3.1: persist() only stages, run() commits), or the documented EntityWriter::write() batch equivalent is used', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => executesUnitOfWork(read(c.abs)));
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('no changed src file calls ->run() after ->persist() (or uses EntityWriter::write()) - the Unit of Work is still never executed');
  }),

  check('persist-still-present', 'The staging call survives the fix: ->persist() (or EntityWriter::write()) is still present in changed src - the bug is the missing execution, not the staging', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => stagesEntity(read(c.abs)));
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('the persist() staging call was removed instead of being executed');
  }),

  check('no-doctrine-flush', 'No Doctrine-brain ->flush() anywhere in changed PHP - Cycle\'s EntityManagerInterface has no flush(); execution is ->run() (guide §3.1/§3.2)', ({ changed }) => {
    const bad = php(changed).filter((c) => /->\s*flush\s*\(/.test(read(c.abs)));
    return bad.length
      ? fail(`Doctrine-style flush() used (not a Cycle API): ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  check('no-raw-sql-fix', 'No hand-rolled SQL INSERT sneaked in as the "fix" - storage stays the Cycle data-mapper path', ({ changed }) => {
    const bad = srcPhp(changed).filter((c) => /INSERT\s+INTO/i.test(read(c.abs)));
    return bad.length
      ? fail(`raw SQL INSERT in changed src: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  check('entity-still-attributed', 'The Cycle entity mapping survives: some src/ class still carries #[Entity(...)] + #[Column(...)] attributes (the agent must not "fix" the bug by rewriting the mapping away)', ({ dir }) => {
    const attributed = filesMatching(dir, /^src\/.*\.php$/).filter((p) => {
      const t = read(p);
      return /#\[\s*\\?(?:Cycle\\Annotated\\Annotation\\)?Entity\b/.test(t)
        && /#\[\s*\\?(?:Cycle\\Annotated\\Annotation\\)?Column\b/.test(t);
    });
    return attributed.length
      ? ok(attributed.map((p) => p.replace(/\\/g, '/')).join(', '))
      : fail('no attribute-based Cycle entity (#[Entity]/#[Column]) left under src/');
  }),

  check('transcript-mentions-run', 'The transcript explains the run() / Unit of Work rule (persist() stages, run() executes, forgetting run() is silent data loss)', ({ transcript }) => {
    return /\brun\s*\(\s*\)|unit\s*-?\s*of\s*-?\s*work/i.test(transcript)
      ? ok('transcript references run() / Unit of Work')
      : fail('transcript never mentions ->run() or the Unit of Work - the root cause was not explained');
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),
];
