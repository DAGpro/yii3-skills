// Mutation control of the checks themselves (external-audit P1, meta-test tool).
// Each targeted mutant is built from a scenario's positive sample by applying a
// specific defect edit; the grading run must then FAIL every check listed in
// expectFail (sensitivity) and - informationally - nothing else (specificity).
// Control mutants are behavior-preserving rewrites that must fail nothing at all
// (they guard against false positives introduced by hardening).
//
// Usage: node evals/audit/mutation.mjs [--json]
//   exit 0 = every targeted mutant caught and every control clean; exit 1 otherwise.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles } from '../lib/checks.mjs';
import { runChecks, requiredFailed } from '../runner/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const S = join(root, 'scenarios');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TX = `        $this->db->transaction(function () use ($postId, $body): void {
            $this->comments->save(new Comment($postId, $body));
        });
        $this->events->dispatch(new CommentAdded($postId));`;

const MUTANTS = [
  // --- targeted mutants: the named check MUST fail --------------------------------
  {
    id: 'di-target-stdClass',
    scenario: '01-full-add-comment',
    expectFail: ['interface-bound'],
    edits: [{ file: 'config/common/di/blog.php', from: 'CommentRepositoryInterface::class => DbCommentRepository::class,', to: 'CommentRepositoryInterface::class => \\stdClass::class,' }],
  },
  {
    id: 'di-binding-comment-only',
    scenario: '01-full-add-comment',
    expectFail: ['interface-bound'],
    edits: [{ file: 'config/common/di/blog.php', from: '    CommentRepositoryInterface::class => DbCommentRepository::class,', to: '    // CommentRepositoryInterface::class => DbCommentRepository::class,' }],
  },
  {
    id: 'dispatch-before-transaction',
    scenario: '01-full-add-comment',
    expectFail: ['event-after-commit'],
    edits: [{ file: 'src/Blog/Application/AddCommentHandler.php', from: TX, to: `        $this->events->dispatch(new CommentAdded($postId));\n` + TX.split('\n').slice(0, 3).join('\n') }],
  },
  {
    id: 'dispatch-inside-transaction',
    scenario: '01-full-add-comment',
    expectFail: ['event-after-commit'],
    edits: [{ file: 'src/Blog/Application/AddCommentHandler.php', from: TX, to: `        $this->db->transaction(function () use ($postId, $body): void {
            $this->comments->save(new Comment($postId, $body));
            $this->events->dispatch(new CommentAdded($postId));
        });` }],
  },
  {
    id: 'migration-wrong-table-drop',
    scenario: '01-full-add-comment',
    expectFail: ['migration-reversible'],
    edits: [{ file: 'migrations/M260105000000CreateComment.php', from: `dropTable('comment');`, to: `dropTable('post');` }],
  },
  {
    id: 'migration-down-comment-only',
    scenario: '01-full-add-comment',
    expectFail: ['migration-reversible'],
    edits: [{ file: 'migrations/M260105000000CreateComment.php', from: `        $b->dropTable('comment');`, to: `        // $b->dropTable('comment');` }],
  },
  {
    id: 'di-target-stdClass-03',
    scenario: '03-forgotten-di-binding',
    expectFail: ['interface-bound'],
    edits: [{ file: 'config/common/di/blog.php', from: 'ViewCounterInterface::class => DbViewCounter::class,', to: 'ViewCounterInterface::class => \\stdClass::class,' }],
  },
  {
    id: 'dto-attributes-docblock-only',
    scenario: '13-complex-action',
    expectFail: ['input-dto-validated'],
    edits: [{
      file: 'src/Blog/Application/SaveSettingsInput.php',
      from: `#[FromBody]
final class SaveSettingsInput extends AbstractInput
{
    #[Validate(new Length(min: 1, max: 100))]
    public string $title = '';

    #[Validate(new Integer(min: 1, max: 50))]
    public int $postsPerPage = 10;

    #[Validate(new Length(max: 500))]
    public string $description = '';
}`,
      to: `/**
 * Validation rules (docblock copy - NOT real attributes):
 * #[Validate(new Length(min: 1, max: 100))] on title,
 * #[Validate(new Integer(min: 1, max: 50))] on postsPerPage,
 * #[Validate(new Length(max: 500))] on description.
 */
#[FromBody]
final class SaveSettingsInput extends AbstractInput
{
    public string $title = '';

    public int $postsPerPage = 10;

    public string $description = '';
}`,
    }],
  },
  {
    id: 'dto-declared-but-unwired',
    scenario: '13-complex-action',
    expectFail: ['input-dto-validated', 'action-typed-input'],
    edits: [{ file: 'src/Web/Blog/SaveSettingsAction.php', from: '    public function __invoke(SaveSettingsInput $input): ResponseInterface', to: '    public function __invoke(array $raw): ResponseInterface' }],
  },
  {
    id: 'migration-wrong-column-drop',
    scenario: '27-migration-add-column',
    expectFail: ['down-drops-column'],
    edits: [{ file: 'migrations/M260115100000AddLastLoginAtToUsers.php', from: `dropColumn(table: 'users', column: 'last_login_at');`, to: `dropColumn(table: 'users', column: 'updated_at');` }],
  },

  // --- control mutants: behavior-preserving rewrites must fail NOTHING -------------
  {
    id: 'control-strict-types-spaces',
    scenario: '01-full-add-comment',
    expectFail: [],
    edits: [{ file: 'src/Blog/Application/AddCommentHandler.php', from: 'declare(strict_types=1);', to: 'declare( strict_types = 1 );' }],
  },
  {
    id: 'control-docblock-mentions-yii2',
    scenario: '01-full-add-comment',
    expectFail: [],
    edits: [{ file: 'src/Blog/Application/AddCommentHandler.php', from: 'final readonly class AddCommentHandler', to: '/**\n * Legacy reference: this handler replaces the Yii::$app flow.\n */\nfinal readonly class AddCommentHandler' }],
  },
  {
    id: 'control-migration-class-constants',
    scenario: '27-migration-add-column',
    expectFail: [],
    edits: [{
      file: 'migrations/M260115100000AddLastLoginAtToUsers.php',
      from: `final class M260115100000AddLastLoginAtToUsers implements RevertibleMigrationInterface
{`,
      to: `final class M260115100000AddLastLoginAtToUsers implements RevertibleMigrationInterface
{
    private const TABLE_NAME = 'users';
`,
    }, { file: 'migrations/M260115100000AddLastLoginAtToUsers.php', from: `table: 'users',`, to: `table: self::TABLE_NAME,` }],
  },
];

const json = process.argv.includes('--json');
const results = [];
let misses = 0;

for (const mut of MUTANTS) {
  const sDir = join(S, mut.scenario);
  const work = mkdtempSync(join(tmpdir(), `eval-mut-`));
  let error = null;
  try {
    cpSync(join(sDir, 'fixture'), work, { recursive: true });
    cpSync(join(sDir, 'positive-sample'), work, { recursive: true });
    for (const e of mut.edits) {
      const f = join(work, e.file);
      const original = read(f);
      if (!original.includes(e.from)) throw new Error(`mutation marker not found in ${e.file}`);
      writeFileSync(f, original.replace(e.from, e.to));
    }
    const changed = changedFiles(work, join(sDir, 'fixture')).filter((c) => c.path !== 'transcript.txt');
    const res = await runChecks(sDir, { dir: work, base: join(sDir, 'fixture'), transcript: read(join(sDir, 'positive-sample', 'transcript.txt')), changed, mode: 'mutation' });
    const failed = requiredFailed(res).map((r) => r.id);
    const notCaught = mut.expectFail.filter((x) => !failed.includes(x));
    const collateral = failed.filter((x) => !mut.expectFail.includes(x));
    const control = mut.expectFail.length === 0;
    const ok = control ? failed.length === 0 : notCaught.length === 0;
    if (!ok) misses++;
    results.push({ id: mut.id, scenario: mut.scenario, control, ok, caught: mut.expectFail.filter((x) => failed.includes(x)), notCaught, collateral, failedRequired: failed });
    if (!json) console.log(`${control ? (ok ? 'CLEAN        ' : 'FALSE-POSITIVE') : ok ? 'CAUGHT    ' : 'SURVIVED  '}  ${mut.id.padEnd(34)} expected=[${mut.expectFail.join(', ') || '-'}] failed=[${failed.join(', ') || '-'}]${collateral.length && !control ? ` collateral=[${collateral.join(', ')}]` : ''}`);
  } catch (e) {
    error = e.message;
    misses++;
    results.push({ id: mut.id, scenario: mut.scenario, ok: false, error });
    if (!json) console.log(`ERROR    ${mut.id.padEnd(34)} ${error}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const targeted = results.filter((r) => !r.control);
const controls = results.filter((r) => r.control);
const summary = {
  targeted: targeted.length,
  targetedCaught: targeted.filter((r) => r.ok).length,
  survived: targeted.filter((r) => !r.ok).length,
  collateralFree: targeted.filter((r) => r.ok && (!r.collateral || r.collateral.length === 0)).length,
  controls: controls.length,
  controlsClean: controls.filter((r) => r.ok).length,
};
if (!json) {
  console.log(`\nmutation-control: targeted caught ${summary.targetedCaught}/${summary.targeted} (survived ${summary.survived}), collateral-free ${summary.collateralFree}/${summary.targetedCaught}, controls clean ${summary.controlsClean}/${summary.controls}`);
} else {
  console.log(JSON.stringify({ summary, results }, null, 2));
}
process.exit(misses ? 1 : 0);
