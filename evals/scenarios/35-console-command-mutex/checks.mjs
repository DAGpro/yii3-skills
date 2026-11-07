import { check, ok, fail, read, matchParen, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const configPhp = (dir) => filesMatching(dir, /^config\/.*\.php$/);

/** Constructor DI of the grounded mutex contracts (factory interface, mutex interface, or Synchronizer). */
const MUTEX_INJECTED =
  /(?:\\?Yiisoft\\Mutex\\(?:File\\|Redis\\|Pgsql\\|Mysql\\|Oracle\\)?)?(?:MutexFactoryInterface|MutexInterface|Synchronizer)\s+\$\w+/;
/** Concrete mutex driver instantiation inside app code (driver choice belongs to DI config). */
const CONCRETE_MUTEX = /new\s+[\w\\]*Mutex(?:Factory)?\s*\(/;

/** First index of lock initiation: MutexInterface::acquire(), factory createAndAcquire(), or Synchronizer::execute(). */
const lockInitIndex = (t) => {
  const m = t.match(/->\s*(?:acquire|createAndAcquire|execute)\s*\(/);
  return m === null ? -1 : m.index;
};

/** `if (... acquire ...) {...}` shape - the acquire bool is actually inspected. */
const hasIfAcquire = (t) => {
  const re = /\bif\s*\(/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(t, open);
    if (close !== -1 && /\b(?:createAndAcquire|acquire)\b/.test(t.slice(open, close))) return true;
  }
  return false;
};

const hasCatchLocked = (t) =>
  /catch\s*\(\s*\\?Yiisoft\\Mutex\\Exception\\MutexLockedException\b|catch\s*\(\s*MutexLockedException\b/.test(t);

/** Non-zero error exit on the busy path (Symfony Command::FAILURE, yii-console ExitCode errors, or bare 1). */
const hasFailureExit = (t) =>
  /return\s+(?:\\?Symfony\\Component\\Console\\Command\\)?Command::FAILURE\b/.test(t)
  || /ExitCode::(?:UNSPECIFIED_ERROR|UNAVAILABLE)\b/.test(t)
  || /return\s+1\s*;/.test(t);

/** Arguments of every `->acquire(...)` call - MutexInterface::acquire(int $timeout = 0) takes no lock name. */
const acquireSegments = (t) => {
  const segs = [];
  const re = /->\s*acquire\s*\(/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(t, open);
    segs.push(close === -1 ? t.slice(open + 1, open + 120) : t.slice(open + 1, close));
  }
  return segs;
};

export default [
  check('mutex-injected', 'The mutex comes from constructor DI (MutexFactoryInterface / MutexInterface / Synchronizer) - no concrete driver instantiation in app code', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => MUTEX_INJECTED.test(read(c.abs)));
    if (!hits.length) return fail('no MutexFactoryInterface/MutexInterface/Synchronizer injected via constructor DI');
    const bad = srcPhp(changed).filter((c) => CONCRETE_MUTEX.test(read(c.abs)));
    return bad.length
      ? fail(`concrete mutex driver instantiated in app code: ${bad.map((b) => b.path).join(', ')}`)
      : ok(hits.map((h) => h.path).join(', '));
  }),

  check('mutex-factory-wired', 'MutexFactoryInterface is explicitly bound in config/ (no mutex package provides auto-configuration)', ({ dir }) => {
    const hits = configPhp(dir).filter((f) => /\bMutexFactoryInterface::class\b/.test(read(f)));
    return hits.length
      ? ok(hits.join(', '))
      : fail('no MutexFactoryInterface binding under config/ - the container cannot build the lock');
  }),

  check('acquire-before-work', 'The lock is initiated (acquire / createAndAcquire / Synchronizer::execute) BEFORE the import work runs (position check in the changed command)', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => /\bimportFeed\s*\(/.test(read(c.abs)));
    if (!hits.length) return fail('no changed src file contains the import work call - the guard task was not implemented where the work happens');
    const bad = [];
    const good = [];
    for (const c of hits) {
      const t = read(c.abs);
      const initIdx = lockInitIndex(t);
      const workIdx = t.search(/\bimportFeed\s*\(/);
      if (initIdx === -1) bad.push(`${c.path}: no lock acquisition at all`);
      else if (initIdx > workIdx) bad.push(`${c.path}: the lock is acquired after the import work started`);
      else good.push(c.path);
    }
    return bad.length ? fail(bad.join('; ')) : ok(good.join(', '));
  }),

  check('busy-path-exits-error', 'The busy path is handled and exits with an error status: acquire() result inspected via if(...) (or MutexLockedException caught) plus a non-zero exit (Command::FAILURE / ExitCode error / 1)', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      return (hasIfAcquire(t) || hasCatchLocked(t)) && hasFailureExit(t);
    });
    if (hits.length) return ok(hits.map((h) => h.path).join(', '));
    const partial = srcPhp(changed).filter((c) => hasIfAcquire(read(c.abs)) || hasCatchLocked(read(c.abs)));
    return partial.length
      ? fail(`acquire result checked in ${partial.map((p) => p.path).join(', ')} but the busy path never exits with an error status`)
      : fail('acquire() return value is never inspected (and no MutexLockedException is caught) - an overlapping run silently proceeds or exits success');
  }),

  check('release-called', 'The lock is released after the work: ->release() present (after the acquisition, ideally in a finally block), or Synchronizer::execute() used (guaranteed automatic release)', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      if (/->\s*execute\s*\(/.test(t)) return true;
      const releaseIdx = t.search(/->\s*release\s*\(/);
      const initIdx = lockInitIndex(t);
      return releaseIdx !== -1 && (initIdx === -1 || releaseIdx > initIdx);
    });
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no lock release after the work - a finished or crashed run would hold the lock forever');
  }),

  check('acquire-no-name-arg', 'Every ->acquire() call passes only an optional int timeout (MutexInterface::acquire(int $timeout = 0) - the lock name belongs to the factory, strict_types makes a string name throw)', ({ changed }) => {
    const bad = [];
    for (const c of srcPhp(changed)) {
      for (const seg of acquireSegments(read(c.abs))) {
        const norm = seg.replace(/\s+/g, '');
        if (norm !== '' && !/^(?:timeout:)?\d+$/.test(norm)) bad.push(`${c.path}: ->acquire(${seg.trim().slice(0, 40)})`);
      }
    }
    return bad.length ? fail(bad.join('; ')) : ok();
  }),

  check('no-flock', 'No raw flock() calls in changed src code - locking goes through yiisoft/mutex, not hand-rolled file locks', ({ changed }) => {
    const bad = srcPhp(changed).filter((c) => /\bflock\s*\(/.test(read(c.abs)));
    return bad.length ? fail(`raw flock() in changed src files: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('no-yii2', 'No Yii2 constructs in changed PHP files (Yii::$app, \\Yii::, use yii\\, #[Override], ActiveForm, session flash methods)', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->setFlash\s*\(|->getFlash\s*\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-lock', 'The final answer mentions the lock/mutex guard', ({ transcript }) =>
    /lock|mutex|acquire/i.test(transcript)
      ? ok()
      : fail('transcript does not mention the lock/mutex guard')),
];
