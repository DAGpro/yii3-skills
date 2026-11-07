import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\//.test(c.path));

/**
 * Changed src/ files that carry the SQL/data path (db API usage).
 * Grounded: ConnectionInterface — references/db/src/Connection/ConnectionInterface.php:76 (createCommand),
 * Query — references/db/src/Query/Query.php:88/:121, CommandInterface — references/db/src/Command/CommandInterface.php.
 */
const DB_TOKEN = /Yiisoft\\Db\\Connection\\ConnectionInterface|Yiisoft\\Db\\Query\\|Yiisoft\\Db\\Command|createCommand|new\s+\\?(?:Yiisoft\\Db\\Query\\)?Query\b/;
const dbFiles = (changed) =>
  srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => DB_TOKEN.test(t));

/**
 * A line that carries a SQL keyword AND a string concatenation into the quoted literal:
 * `"SELECT ... WHERE o.number LIKE '%" . $term . "%'"`. Concat building of wildcards in a *params*
 * array (`[':term' => '%' . $term . '%']`) has no SQL keyword on its own line and is not flagged.
 */
const SQL_KW = /\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|LIKE)\b/;
const CONCAT_L = /['"]\s*\.\s*\$/;
const CONCAT_R = /\$\w+\s*\.\s*['"]/;
const sqlConcatLines = (t) => t.split('\n').filter((l) => SQL_KW.test(l) && (CONCAT_L.test(l) || CONCAT_R.test(l)));

/**
 * Grounded Query Builder usage: Query instantiation
 * (Query::__construct(protected ConnectionInterface $db) — references/db/src/Query/Query.php:121;
 * guide persistence-db-connection-and-queries.md §3.1: `(new Query($db))->from(...)->where([...])`)
 * or a where-family call whose condition array references a variable
 * (Query::where/andWhere/andFilterWhere(...): static — references/db/src/Query/Query.php:769/:241/:188;
 * the 'like' operator maps to Condition\Like — references/db/src/QueryBuilder/AbstractDQLQueryBuilder.php:546,
 * references/db/src/QueryBuilder/Condition/Like.php:7; condition values are bound by the builder).
 */
const QB_NEW = /\bnew\s+\\?(?:Yiisoft\\Db\\Query\\)?Query\s*\(/;
const QB_IMPORT = /use\s+Yiisoft\\Db\\Query\\Query;|use\s+Yiisoft\\Db\\Query\\QueryPartsInterface;|Yiisoft\\Db\\QueryBuilder\\QueryBuilderInterface/;
const whereCondVar = (t) => {
  const re = /->\s*(?:where|andWhere|orWhere|setWhere|filterWhere|andFilterWhere|orFilterWhere)\s*\(/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const close = matchParen(t, m.index + m[0].length - 1);
    if (close !== -1 && /\$/.test(t.slice(m.index + m[0].length, close))) return true;
  }
  return false;
};
const qbUsed = (t) => QB_NEW.test(t) || QB_IMPORT.test(t) || whereCondVar(t);

/**
 * The user term goes through a bound parameter: CommandInterface::bindValues/bindValue
 * (grounded: references/db/src/Command/CommandInterface.php:275/:259), a named :placeholder inside a
 * SQL-keyword line (guide persistence-db-connection-and-queries.md §2.1 createCommand(sql:, params:)),
 * or the user value passed into a builder condition array (whereCondVar above).
 */
const BIND_CALL = /->\s*bindValues?\s*\(/;
const namedParamOnSqlLine = (t) =>
  t.split('\n').some((l) => SQL_KW.test(l) && /(?<!:)[:][a-zA-Z]\w*/.test(l));
const paramBound = (t) => BIND_CALL.test(t) || whereCondVar(t) || namedParamOnSqlLine(t);

/**
 * Raw low-level command reads — CommandInterface::query()/queryAll()/queryOne()/queryScalar()
 * (grounded: references/db/src/Command/CommandInterface.php:654/:667/:694/:709) — fed by concatenated SQL.
 */
const RAW_QUERY_CALL = /->\s*query(?:All|One|Scalar)?\s*\(/;

export default [
  check('query-builder-used', 'The SQL-carrying changed src/ file builds the search via the yiisoft/db Query Builder (new Query(...) / where-family condition with a value) instead of a hand-built SQL string. Grounded: Query.php:121/:769/:241, guide §3.1', ({ changed }) => {
    const files = dbFiles(changed);
    if (!files.length) return fail('no changed src/ file carries the db/SQL path');
    const hit = files.filter(({ t }) => qbUsed(t));
    return hit.length
      ? ok(hit.map((b) => b.path).join(', '))
      : fail('no Query Builder instantiation or where-family condition anywhere on the db path');
  }),

  check('param-bound', 'The user term goes through parameter binding: ->bindValues()/->bindValue(), a named :placeholder in the SQL, or the term passed as a builder condition value. Grounded: CommandInterface.php:275/:259, guide §2.1/§3.1', ({ changed }) => {
    const files = dbFiles(changed);
    if (!files.length) return fail('no changed src/ file carries the db/SQL path');
    const hit = files.filter(({ t }) => paramBound(t));
    return hit.length
      ? ok(hit.map((b) => b.path).join(', '))
      : fail('no bound parameter path found (no bindValues/bindValue, no :placeholder in SQL, no condition-array value)');
  }),

  check('no-sql-concat', 'No SQL string concatenation remains on the db path: no line in a changed SQL-carrying src/ file combines a SQL keyword with quote-to-variable concatenation ("..." . $x / $x . "..."). Tradeoff (text check): wildcard concat inside a params array without SQL keywords on the same line is not flagged; messages/comments with SQL words near concat are', ({ changed }) => {
    const bad = dbFiles(changed).filter(({ t }) => sqlConcatLines(t).length > 0);
    return bad.length
      ? fail(`concatenated SQL: ${bad.map((b) => b.path).join(', ')} — ${bad.flatMap((b) => sqlConcatLines(b.t).map((l) => l.trim().slice(0, 80))).join(' | ')}`)
      : ok();
  }),

  check('no-raw-query-concat', 'No raw command read (CommandInterface::query()/queryAll()/queryOne()/queryScalar() — grounded: CommandInterface.php:654/:667/:694/:709) sits on a db path whose SQL was concatenated. A bound command read is legitimate (guide §2.1); only the concatenated-SQL variant is banned', ({ changed }) => {
    const bad = dbFiles(changed).filter(({ t }) => RAW_QUERY_CALL.test(t) && sqlConcatLines(t).length > 0);
    return bad.length
      ? fail(`raw query over concatenated SQL: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  check('search-contract-kept', 'The repository keeps its public contract: a search() method is still declared in the changed code (the fixture interface and the action depend on it)', ({ changed }) => {
    const hit = php(changed).filter((c) => /function\s+search\s*\(/.test(read(c.abs)));
    return hit.length ? ok(hit.map((b) => b.path).join(', ')) : fail('no search() method in the changed code - public contract broken');
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

  check('transcript-mentions-binding', 'The transcript reports the fix in binding terms (parameter binding / bound value / placeholder), not as escaping', ({ transcript }) => {
    return /\bbind|\bbound\b|placeholder/i.test(transcript)
      ? ok()
      : fail('transcript does not mention parameter binding, a bound value or a placeholder');
  }),
];
