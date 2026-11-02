<?php

declare(strict_types=1);

/**
 * Yii 3 Action & Controller Static Verifier.
 *
 * Fast, deterministic static analyzer for Yii 3 Actions and Controllers.
 * Zero LLM token consumption, zero external Composer dependencies required.
 *
 * Checks performed:
 * 1. Presence of 'declare(strict_types=1);' at the top of action files.
 * 2. Strict return type declaration 'Psr\Http\Message\ResponseInterface' on action methods.
 * 3. Thin Action Principle: Absence of direct SQL, ActiveRecord, or low-level DB/ORM queries.
 * 4. Prohibition of legacy Yii 2 remnants (Yii::$app, yii\* namespaces, superglobals, $model->load()).
 * 5. High-frequency Yii 3 presentation pitfalls (Cookie::create, withStatus on ViewRenderer, etc.).
 *
 * Exit Codes:
 *   0: All action files passed verification (no violations found).
 *   1: Violations found (errors reported with line numbers).
 *   2: Fatal invocation error (invalid path, unreadable file, unsupported PHP version).
 */

if (PHP_VERSION_ID < 80100) {
    fwrite(STDERR, "[FATAL] verify-actions requires PHP 8.1 or higher (current: " . PHP_VERSION . ").\n");
    exit(2);
}

final class ActionVerifier
{
    private string $basePath;
    private ?string $specificFile = null;
    private string $format = 'text'; // 'text' | 'json'
    private bool $quiet = false;
    private bool $verbose = false;

    /** @var array<int, array{type: 'error'|'warning', file: string, line: int, rule: string, message: string}> */
    private array $issues = [];

    private int $filesScannedCount = 0;
    private int $actionsCheckedCount = 0;

    public function __construct(array $argv)
    {
        $this->parseArguments($argv);
    }

    public function run(): int
    {
        $files = $this->discoverActionFiles();
        if (empty($files)) {
            if ($this->specificFile !== null) {
                $this->outputError("Specified file '{$this->specificFile}' not found or unreadable.");
                return 2;
            }

            $this->outputError("No Action or Controller files found in '{$this->basePath}'. Place action files in 'src/**/Action/*.php' or pass --file=<path>.");
            return 2;
        }

        foreach ($files as $file) {
            $this->verifyFile($file);
        }

        $hasErrors = $this->hasErrors();
        $this->renderReport();

        return $hasErrors ? 1 : 0;
    }

    private function parseArguments(array $argv): void
    {
        $this->basePath = getcwd() ?: '.';

        for ($i = 1; $i < count($argv); $i++) {
            $arg = $argv[$i];

            if ($arg === '--help' || $arg === '-h') {
                $this->printHelp();
                exit(0);
            }

            if ($arg === '--quiet' || $arg === '-q') {
                $this->quiet = true;
                continue;
            }

            if ($arg === '--verbose' || $arg === '-v') {
                $this->verbose = true;
                continue;
            }

            if (str_starts_with($arg, '--format=')) {
                $fmt = substr($arg, 9);
                $this->format = in_array($fmt, ['text', 'json'], true) ? $fmt : 'text';
                continue;
            }

            if (str_starts_with($arg, '--path=')) {
                $this->basePath = substr($arg, 7);
                continue;
            }

            if (str_starts_with($arg, '--file=')) {
                $this->specificFile = substr($arg, 7);
                continue;
            }

            if (!str_starts_with($arg, '-')) {
                // Positional argument: either specific file or base path
                if (is_file($arg)) {
                    $this->specificFile = $arg;
                } else {
                    $this->basePath = $arg;
                }
            }
        }

        $this->basePath = rtrim(str_replace('\\', '/', realpath($this->basePath) ?: $this->basePath), '/');
        if ($this->specificFile !== null) {
            $real = realpath($this->specificFile);
            $this->specificFile = $real ? str_replace('\\', '/', $real) : $this->specificFile;
        }
    }

    private function printHelp(): void
    {
        echo <<<'HELP'
Yii 3 Action & Controller Static Verifier (verify-actions)

Usage:
  php verify-actions.php [options] [path]

Arguments:
  path                  Path to the target Yii3 project root or action file (default: current working directory).

Options:
  --file=<file>         Verify a single specific Action or Controller file.
  --path=<path>         Target project root directory to scan.
  --format=text|json    Output format: concise text list (default) or structured JSON.
  --quiet, -q           Only print errors and warnings (concise list with line numbers).
  --verbose, -v         Display detailed scanning progress and checked action methods.
  --help, -h            Show this help message.

Checks Performed:
  - declare(strict_types=1); presence as the first statement.
  - Strict return type Psr\Http\Message\ResponseInterface on all action methods.
  - Thin Action Principle (no direct SQL, ActiveRecord, or low-level DB/ORM queries in Actions).
  - Prohibition of legacy Yii 2 remnants (Yii::$app, yii\* namespaces, superglobals, $model->load()).
  - High-frequency Yii 3 traps (Cookie::create(), nonexistent methods, ViewRenderer->withStatus()).

Examples:
  php verify-actions.php
  php verify-actions.php /path/to/my-yii3-app
  php verify-actions.php --file=src/Presentation/Action/User/ViewUserAction.php
  php verify-actions.php --quiet
  php verify-actions.php --format=json

HELP;
    }

    /**
     * @return string[]
     */
    private function discoverActionFiles(): array
    {
        if ($this->specificFile !== null) {
            return is_file($this->specificFile) ? [$this->specificFile] : [];
        }

        $discovered = [];
        $searchDir = $this->resolveCaseInsensitiveDir($this->basePath, 'src') ?? $this->basePath;

        if (!is_dir($searchDir)) {
            return [];
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($searchDir, FilesystemIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS)
        );

        $excludedDirs = [
            'vendor',
            'runtime',
            'tests',
            'references',
            'node_modules',
            '.git',
            '.ai-factory',
            '.agent',
            '.agents',
            '.cache',
        ];

        /** @var SplFileInfo $fileInfo */
        foreach ($iterator as $fileInfo) {
            if ($fileInfo->getExtension() !== 'php') {
                continue;
            }

            $normalized = str_replace('\\', '/', $fileInfo->getPathname());

            // Check if file is in an excluded directory
            $skip = false;
            foreach ($excludedDirs as $ex) {
                if (str_contains($normalized, "/$ex/")) {
                    $skip = true;
                    break;
                }
            }
            if ($skip) {
                continue;
            }

            // Identify Action or Controller candidates:
            // 1. Files ending in Action.php or Controller.php
            // 2. Files located within Action/, Actions/, Controller/, Controllers/ directories
            $filename = basename($normalized);
            if (
                preg_match('/(Action|Controller)\.php$/i', $filename) ||
                preg_match('#/(Actions?|Controllers?)/#i', $normalized)
            ) {
                $discovered[] = $normalized;
            }
        }

        sort($discovered);
        return $discovered;
    }

    /**
     * Resolve a well-known directory under basePath, tolerating case
     * differences (e.g. 'Src/' on case-sensitive filesystems):
     * prefer the exact lowercase name, else take the first case-insensitive
     * directory-name match in sorted order for deterministic discovery.
     */
    private function resolveCaseInsensitiveDir(string $basePath, string $name): ?string
    {
        $exact = $basePath . '/' . $name;
        if (is_dir($exact)) {
            return $exact;
        }

        $candidates = glob($basePath . '/*', GLOB_ONLYDIR) ?: [];
        sort($candidates);
        foreach ($candidates as $candidate) {
            if (strcasecmp(basename(str_replace('\\', '/', $candidate)), $name) === 0) {
                return $candidate;
            }
        }

        return null;
    }

    private function verifyFile(string $filePath): void
    {
        $relPath = $this->getRelativePath($filePath);
        $this->filesScannedCount++;

        $content = @file_get_contents($filePath);
        if ($content === false) {
            $this->addIssue('error', $relPath, 1, 'file_unreadable', "Unable to read file: $relPath");
            return;
        }

        try {
            $tokens = PhpToken::tokenize($content, TOKEN_PARSE);
        } catch (\ParseError $e) {
            $this->addIssue('error', $relPath, $e->getLine(), 'php_syntax_error', "PHP syntax error: " . $e->getMessage());
            return;
        }

        $analyzer = new ActionAstAnalyzer($relPath, $content, $tokens);
        $fileIssues = $analyzer->analyze();

        foreach ($fileIssues as $issue) {
            $this->issues[] = $issue;
        }

        $this->actionsCheckedCount += $analyzer->getCheckedActionsCount();
    }

    private function addIssue(string $type, string $file, int $line, string $rule, string $message): void
    {
        $this->issues[] = [
            'type' => $type,
            'file' => $file,
            'line' => $line,
            'rule' => $rule,
            'message' => $message,
        ];
    }

    private function hasErrors(): bool
    {
        foreach ($this->issues as $issue) {
            if ($issue['type'] === 'error') {
                return true;
            }
        }
        return false;
    }

    private function getRelativePath(string $fullPath): string
    {
        $fullPath = str_replace('\\', '/', $fullPath);
        if (str_starts_with($fullPath, $this->basePath . '/')) {
            return substr($fullPath, strlen($this->basePath) + 1);
        }
        return $fullPath;
    }

    private function renderReport(): void
    {
        $errorCount = 0;
        $warningCount = 0;

        foreach ($this->issues as $issue) {
            if ($issue['type'] === 'error') {
                $errorCount++;
            } else {
                $warningCount++;
            }
        }

        if ($this->format === 'json') {
            $result = [
                'status' => $errorCount === 0 ? 'passed' : 'failed',
                'exit_code' => $errorCount === 0 ? 0 : 1,
                'summary' => [
                    'files_scanned' => $this->filesScannedCount,
                    'actions_checked' => $this->actionsCheckedCount,
                    'errors_count' => $errorCount,
                    'warnings_count' => $warningCount,
                ],
                'issues' => $this->issues,
            ];
            echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
            return;
        }

        // Text format
        if (!$this->quiet) {
            echo "============================================================\n";
            echo " Yii 3 Action & Controller Verifier (verify-actions)        \n";
            echo "============================================================\n";
            echo "Base path: {$this->basePath}\n";
            echo "Scanned: {$this->filesScannedCount} file(s), {$this->actionsCheckedCount} action method(s)\n\n";
        }

        if (empty($this->issues)) {
            if (!$this->quiet) {
                echo "[OK] All {$this->filesScannedCount} action file(s) and {$this->actionsCheckedCount} action method(s) passed verification.\n";
                echo "Zero violations found. Strict types and Thin Action contracts satisfied.\n";
            }
            return;
        }

        // Output violations list with line numbers
        foreach ($this->issues as $issue) {
            $tag = strtoupper($issue['type']);
            $color = $tag === 'ERROR' ? "\033[31m" : "\033[33m";
            $reset = "\033[0m";

            $hasColor = function_exists('posix_isatty') ? posix_isatty(STDOUT) : (DIRECTORY_SEPARATOR === '/');
            if ($hasColor) {
                echo "{$color}[{$tag}]{$reset} {$issue['file']}:{$issue['line']} - {$issue['message']}\n";
            } else {
                echo "[{$tag}] {$issue['file']}:{$issue['line']} - {$issue['message']}\n";
            }
        }

        if (!$this->quiet) {
            echo "\n------------------------------------------------------------\n";
            echo "Summary: Scanned {$this->filesScannedCount} file(s), {$this->actionsCheckedCount} action method(s).\n";
            echo "Errors: $errorCount | Warnings: $warningCount\n";
            echo "Result: " . ($errorCount === 0 ? "PASSED" : "FAILED") . "\n";
        }
    }

    private function outputError(string $message): void
    {
        if ($this->format === 'json') {
            echo json_encode(['status' => 'error', 'message' => $message], JSON_PRETTY_PRINT) . "\n";
        } else {
            fwrite(STDERR, "[FATAL] $message\n");
        }
    }
}

/**
 * Static AST Analyzer for Action / Controller PHP files.
 */
final class ActionAstAnalyzer
{
    private string $filePath;
    private string $content;
    /** @var PhpToken[] */
    private array $tokens;
    private int $count;

    private string $namespace = '';
    /** @var array<string, string> short alias => FQCN */
    private array $useImports = [];

    /** @var array<int, array{type: 'error'|'warning', file: string, line: int, rule: string, message: string}> */
    private array $issues = [];

    private int $checkedActionsCount = 0;

    public function __construct(string $filePath, string $content, array $tokens)
    {
        $this->filePath = $filePath;
        $this->content = $content;
        $this->tokens = $tokens;
        $this->count = count($tokens);
    }

    public function getCheckedActionsCount(): int
    {
        return $this->checkedActionsCount;
    }

    /**
     * @return array<int, array{type: 'error'|'warning', file: string, line: int, rule: string, message: string}>
     */
    public function analyze(): array
    {
        // 1. Check declare(strict_types=1);
        $this->checkStrictTypes();

        // 2. Parse namespace and imports
        $this->extractNamespaceAndImports();

        // 3. Inspect global legacy tokens and superglobals
        $this->checkGlobalViolations();

        // 4. Parse classes, constructor injection, and action methods
        $this->checkClassesAndActionMethods();

        return $this->issues;
    }

    private function checkStrictTypes(): void
    {
        $firstNonCommentToken = null;

        for ($i = 0; $i < $this->count; $i++) {
            $t = $this->tokens[$i];
            if ($t->is([T_OPEN_TAG, T_WHITESPACE, T_COMMENT, T_DOC_COMMENT])) {
                continue;
            }
            $firstNonCommentToken = $t;
            $tokenIndex = $i;
            break;
        }

        if ($firstNonCommentToken === null) {
            // Empty file
            return;
        }

        if (!$firstNonCommentToken->is(T_DECLARE)) {
            $this->addIssue(
                'error',
                $firstNonCommentToken->line,
                'strict_types_missing',
                "Missing 'declare(strict_types=1);' declaration at top of file."
            );
            return;
        }

        // Verify declare statement contains strict_types = 1
        $hasStrictTypes = false;
        $strictValue = null;

        for ($i = $tokenIndex + 1; $i < $this->count; $i++) {
            $t = $this->tokens[$i];
            if ($t->is(ord(';')) || $t->is(ord('{'))) {
                break;
            }

            if ($t->is(T_STRING) && strtolower($t->text) === 'strict_types') {
                $hasStrictTypes = true;
                // Look forward for '=' and value
                for ($j = $i + 1; $j < $this->count; $j++) {
                    $tj = $this->tokens[$j];
                    if ($tj->is(T_WHITESPACE)) {
                        continue;
                    }
                    if ($tj->is(ord('='))) {
                        continue;
                    }
                    if ($tj->is(T_LNUMBER)) {
                        $strictValue = (int) $tj->text;
                        break 2;
                    }
                    break;
                }
            }
        }

        if (!$hasStrictTypes) {
            $this->addIssue(
                'error',
                $firstNonCommentToken->line,
                'strict_types_missing',
                "The declare statement does not configure 'strict_types'."
            );
        } elseif ($strictValue !== 1) {
            $this->addIssue(
                'error',
                $firstNonCommentToken->line,
                'strict_types_not_enabled',
                "Strict types must be set to 1 ('declare(strict_types=1);'), found: " . ($strictValue ?? 'none') . "."
            );
        }
    }

    private function extractNamespaceAndImports(): void
    {
        for ($i = 0; $i < $this->count; $i++) {
            $tok = $this->tokens[$i];

            if ($tok->is(T_NAMESPACE)) {
                $ns = '';
                $i++;
                while ($i < $this->count && !$this->tokens[$i]->is([ord(';'), ord('{')])) {
                    if (!$this->tokens[$i]->is(T_WHITESPACE)) {
                        $ns .= $this->tokens[$i]->text;
                    }
                    $i++;
                }
                $this->namespace = trim($ns, '\\');
            } elseif ($tok->is(T_USE)) {
                $i = $this->parseUseStatement($i);
            }
        }
    }

    private function parseUseStatement(int $startIndex): int
    {
        $i = $startIndex + 1;
        while ($i < $this->count && $this->tokens[$i]->is(T_WHITESPACE)) {
            $i++;
        }

        if ($i < $this->count && ($this->tokens[$i]->is(T_FUNCTION) || $this->tokens[$i]->is(T_CONST))) {
            while ($i < $this->count && !$this->tokens[$i]->is(ord(';'))) {
                $i++;
            }
            return $i;
        }

        $buffer = '';
        $prefix = '';
        $line = $this->tokens[$startIndex]->line;

        while ($i < $this->count && !$this->tokens[$i]->is(ord(';'))) {
            $tok = $this->tokens[$i];

            if ($tok->is(ord('{'))) {
                $prefix = trim($buffer, '\\') . '\\';
                $buffer = '';
                $i++;
                continue;
            }

            if ($tok->is(ord('}'))) {
                $prefix = '';
                $buffer = '';
                $i++;
                continue;
            }

            if ($tok->is(ord(','))) {
                $this->registerImport($prefix . $buffer, $line);
                $buffer = '';
                $i++;
                continue;
            }

            if (!$tok->is(T_WHITESPACE)) {
                $buffer .= $tok->text;
            }
            $i++;
        }

        if ($buffer !== '') {
            $this->registerImport($prefix . $buffer, $line);
        }

        return $i;
    }

    private function registerImport(string $importStr, int $line): void
    {
        $importStr = trim($importStr);
        if ($importStr === '') {
            return;
        }

        $alias = null;
        if (preg_match('/\s+as\s+(\w+)$/i', $importStr, $m)) {
            $alias = $m[1];
            $fqcn = trim(substr($importStr, 0, -strlen($m[0])));
        } else {
            $fqcn = $importStr;
            $parts = explode('\\', $fqcn);
            $alias = end($parts);
        }

        $fqcn = ltrim($fqcn, '\\');
        $this->useImports[$alias] = $fqcn;

        // Check for prohibited legacy Yii 2 namespace imports
        if (str_starts_with(strtolower($fqcn), 'yii\\')) {
            $this->addIssue(
                'error',
                $line,
                'prohibited_yii2_namespace',
                "Prohibited legacy Yii 2 namespace '$fqcn' imported. Replace with official Yii 3 'yiisoft/*' packages."
            );
        }

        // Check for common Yii 3 import pitfalls
        if ($fqcn === 'Yiisoft\Cookies\SameSite') {
            $this->addIssue(
                'error',
                $line,
                'nonexistent_samesite_import',
                "Nonexistent class 'Yiisoft\\Cookies\\SameSite' imported. Use 'Cookie::SAME_SITE_*' constants on 'Yiisoft\\Cookies\\Cookie'."
            );
        } elseif ($fqcn === 'Yiisoft\DataResponse\DataResponseFactoryInterface') {
            $this->addIssue(
                'warning',
                $line,
                'deprecated_data_response_factory',
                "Deprecated interface 'Yiisoft\\DataResponse\\DataResponseFactoryInterface' imported. Use 'Yiisoft\\DataResponse\\ResponseFactory\\DataResponseFactoryInterface'."
            );
        }
    }

    private function checkGlobalViolations(): void
    {
        $superglobals = [
            '$_GET',
            '$_POST',
            '$_REQUEST',
            '$_SESSION',
            '$_COOKIE',
            '$_SERVER',
            '$_FILES',
        ];

        for ($i = 0; $i < $this->count; $i++) {
            $tok = $this->tokens[$i];

            // 1. Direct superglobal access in action files
            if ($tok->is(T_VARIABLE) && in_array($tok->text, $superglobals, true)) {
                $this->addIssue(
                    'error',
                    $tok->line,
                    'superglobal_access',
                    "Direct access to superglobal '{$tok->text}' detected. Read parameters from 'ServerRequestInterface' or use 'Yiisoft\\Router\\CurrentRoute'."
                );
            }

            // 2. Legacy Yii::$app or Yii:: static calls
            if ($tok->is([T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED]) && ltrim($tok->text, '\\') === 'Yii') {
                $nextIdx = $this->getNextNonWhitespaceIndex($i);
                if ($nextIdx !== null && $this->tokens[$nextIdx]->is(T_DOUBLE_COLON)) {
                    $targetTok = $this->getNextNonWhitespaceToken($nextIdx);
                    $callTarget = $targetTok !== null ? $targetTok->text : '';
                    $pattern = 'Yii::' . $callTarget;

                    $this->addIssue(
                        'error',
                        $tok->line,
                        'prohibited_yii2_static',
                        "Prohibited legacy Yii 2 construct '$pattern' detected. Yii 3 has eliminated static locators; inject dependencies via constructor."
                    );
                }
            }

            // 3. Cookie::create() nonexistent method
            if ($tok->is([T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED]) && ltrim($tok->text, '\\') === 'Cookie') {
                $nextIdx = $this->getNextNonWhitespaceIndex($i);
                if ($nextIdx !== null && $this->tokens[$nextIdx]->is(T_DOUBLE_COLON)) {
                    $methodTok = $this->getNextNonWhitespaceToken($nextIdx);
                    if ($methodTok !== null && strtolower($methodTok->text) === 'create') {
                        $this->addIssue(
                            'error',
                            $tok->line,
                            'nonexistent_cookie_create',
                            "Nonexistent method 'Cookie::create()' called. In Yii 3, instantiate cookies with 'new Cookie(\$name, \$value)'."
                        );
                    }
                }
            }

            // 4. Legacy $model->load(...) and Action pitfalls
            if ($tok->is(T_OBJECT_OPERATOR) || $tok->is(T_NULLSAFE_OBJECT_OPERATOR)) {
                $methodIdx = $this->getNextNonWhitespaceIndex($i);
                if ($methodIdx !== null && $this->tokens[$methodIdx]->is(T_STRING)) {
                    $methodTok = $this->tokens[$methodIdx];
                    $mName = strtolower($methodTok->text);

                    // Flag ->load()
                    if ($mName === 'load') {
                        $openParenTok = $this->getNextNonWhitespaceToken($methodIdx);
                        if ($openParenTok !== null && $openParenTok->is(ord('('))) {
                            $this->addIssue(
                                'error',
                                $methodTok->line,
                                'legacy_model_load',
                                "Legacy Yii 2 pattern '->load(...)' detected. Use 'HydratorInterface' for DTOs or 'FormHydrator' for FormModels in Yii 3."
                            );
                        }
                    }

                    // Flag ->createToken() on TokenFactory
                    if ($mName === 'createtoken') {
                        $this->addIssue(
                            'error',
                            $methodTok->line,
                            'nonexistent_create_token',
                            "Method '->createToken()' does not exist on 'TokenFactoryInterface'. In 'yiisoft/auth-jwt', the method is 'create(array \$payload, string \$format)'."
                        );
                    }

                    // Flag ->sendStream() or ->send() on DownloadResponseFactory
                    if ($mName === 'sendstream' || $mName === 'send') {
                        $this->addIssue(
                            'error',
                            $methodTok->line,
                            'invalid_download_method',
                            "Invalid method '->{$methodTok->text}()' called on DownloadResponseFactory. Use 'sendStreamAsFile()' or 'sendContentAsFile()'."
                        );
                    }

                    // Flag ->withStatus() on ViewRenderer
                    if ($mName === 'withstatus') {
                        $prevVar = $this->getPreviousVariableToken($i);
                        if ($prevVar !== null && preg_match('/(viewRenderer|renderer)/i', $prevVar->text)) {
                            $this->addIssue(
                                'error',
                                $methodTok->line,
                                'invalid_view_renderer_status',
                                "'ViewRenderer' has no 'withStatus()' method. Call 'withStatus()' on the returned PSR-7 'ResponseInterface' instead."
                            );
                        }
                    }
                }
            }
        }
    }

    private function checkClassesAndActionMethods(): void
    {
        for ($i = 0; $i < $this->count; $i++) {
            $tok = $this->tokens[$i];

            if ($tok->is(T_CLASS)) {
                // Ensure it's not 'new class' (anonymous class)
                $prev = $this->getPreviousNonWhitespaceToken($i);
                if ($prev !== null && $prev->is(T_NEW)) {
                    continue;
                }

                $i = $this->inspectClass($i);
            }
        }
    }

    private function inspectClass(int $classKeywordIndex): int
    {
        // 1. Extract class name
        $className = '';
        $classLine = $this->tokens[$classKeywordIndex]->line;
        $i = $classKeywordIndex + 1;

        while ($i < $this->count && $this->tokens[$i]->is(T_WHITESPACE)) {
            $i++;
        }

        if ($i < $this->count && $this->tokens[$i]->is(T_STRING)) {
            $className = $this->tokens[$i]->text;
            $classLine = $this->tokens[$i]->line;
            $i++;
        }

        // 2. Scan extends and implements
        $extendsClass = null;
        $implementsList = [];

        while ($i < $this->count && !$this->tokens[$i]->is(ord('{'))) {
            $t = $this->tokens[$i];
            if ($t->is(T_EXTENDS)) {
                $extTok = $this->getNextNonWhitespaceToken($i);
                if ($extTok !== null) {
                    $extendsClass = $extTok->text;
                }
            } elseif ($t->is(T_IMPLEMENTS)) {
                // Collect implements
                $i++;
                while ($i < $this->count && !$this->tokens[$i]->is(ord('{')) && !$this->tokens[$i]->is(T_EXTENDS)) {
                    if ($this->tokens[$i]->is(T_STRING) || $this->tokens[$i]->is(T_NAME_QUALIFIED) || $this->tokens[$i]->is(T_NAME_FULLY_QUALIFIED)) {
                        $implementsList[] = $this->tokens[$i]->text;
                    }
                    $i++;
                }
                continue;
            }
            $i++;
        }

        // Flag legacy 'extends Controller' without namespace
        if ($extendsClass === 'Controller' && isset($this->useImports['Controller']) && str_starts_with($this->useImports['Controller'], 'yii\\')) {
            $this->addIssue(
                'error',
                $classLine,
                'legacy_controller_inheritance',
                "Class '$className' extends legacy 'yii\\web\\Controller'. In Yii 3, actions are standalone invokable classes or PSR-15 handlers."
            );
        }

        if ($i >= $this->count || !$this->tokens[$i]->is(ord('{'))) {
            return $i;
        }

        // $i is now at the opening '{' of the class
        $braceDepth = 1;
        $classStartIndex = $i;
        $i++;

        $isActionClass = $this->isActionClassName($className);

        while ($i < $this->count && $braceDepth > 0) {
            $tok = $this->tokens[$i];

            if ($tok->is(ord('{'))) {
                $braceDepth++;
            } elseif ($tok->is(ord('}'))) {
                $braceDepth--;
                if ($braceDepth === 0) {
                    break;
                }
            }

            // Inspect methods inside the class (at brace depth 1)
            if ($braceDepth === 1 && $tok->is(T_FUNCTION)) {
                $i = $this->inspectMethod($i, $className, $isActionClass);
                continue;
            }

            // Inspect Thin Action violations inside class scope
            $this->checkThinActionToken($i, $tok, $className);

            $i++;
        }

        return $i;
    }

    private function inspectMethod(int $functionKeywordIndex, string $className, bool $isActionClass): int
    {
        // Collect modifiers preceding 'function'
        $modifiers = [];
        $p = $functionKeywordIndex - 1;
        while ($p >= 0 && ($this->tokens[$p]->is(T_WHITESPACE) || $this->tokens[$p]->is([
            T_PUBLIC,
            T_PROTECTED,
            T_PRIVATE,
            T_STATIC,
            T_FINAL,
            T_READONLY,
        ]))) {
            if (!$this->tokens[$p]->is(T_WHITESPACE)) {
                $modifiers[] = $this->tokens[$p]->text;
            }
            $p--;
        }

        $isPublic = empty($modifiers) || in_array('public', $modifiers, true);

        // Find method name
        $nameIndex = $functionKeywordIndex + 1;
        while ($nameIndex < $this->count && $this->tokens[$nameIndex]->is(T_WHITESPACE)) {
            $nameIndex++;
        }

        $methodName = '';
        $methodLine = $this->tokens[$functionKeywordIndex]->line;

        if ($nameIndex < $this->count && $this->tokens[$nameIndex]->is([T_STRING, T_NAME_QUALIFIED])) {
            $methodName = $this->tokens[$nameIndex]->text;
            $methodLine = $this->tokens[$nameIndex]->line;
        }

        // Find parameters
        $paramStartIndex = $nameIndex + 1;
        while ($paramStartIndex < $this->count && !$this->tokens[$paramStartIndex]->is(ord('('))) {
            $paramStartIndex++;
        }

        $paramEndIndex = $paramStartIndex + 1;
        $parenDepth = 1;
        while ($paramEndIndex < $this->count && $parenDepth > 0) {
            if ($this->tokens[$paramEndIndex]->is(ord('('))) {
                $parenDepth++;
            } elseif ($this->tokens[$paramEndIndex]->is(ord(')'))) {
                $parenDepth--;
                if ($parenDepth === 0) {
                    break;
                }
            }
            $paramEndIndex++;
        }

        // Check constructor parameters for direct DB/ORM injection (Thin Action)
        if ($methodName === '__construct') {
            $this->checkConstructorDependencies($paramStartIndex, $paramEndIndex, $className);
        }

        // Find return type (between ')' and '{' or ';')
        $returnTypeTokens = [];
        $k = $paramEndIndex + 1;
        $hasColon = false;

        while ($k < $this->count && !$this->tokens[$k]->is(ord('{')) && !$this->tokens[$k]->is(ord(';'))) {
            $t = $this->tokens[$k];
            if ($t->is(ord(':'))) {
                $hasColon = true;
                $k++;
                continue;
            }

            if ($hasColon && !$t->is(T_WHITESPACE)) {
                $returnTypeTokens[] = $t->text;
            }
            $k++;
        }

        $returnType = trim(implode('', $returnTypeTokens));

        // Determine if this method is an Action Handler:
        $isActionMethod = false;
        if ($methodName === '__invoke') {
            $isActionMethod = true;
        } elseif ($methodName === 'handle') {
            $isActionMethod = true;
        } elseif (str_starts_with($methodName, 'action') && strlen($methodName) > 6 && ctype_upper($methodName[6])) {
            $isActionMethod = true;
        } elseif ($isActionClass && $isPublic && !str_starts_with($methodName, '__')) {
            $isActionMethod = true;
        }

        if ($isActionMethod) {
            $this->checkedActionsCount++;
            $this->validateActionReturnType($className, $methodName, $methodLine, $returnType);
        }

        return $k;
    }

    private function validateActionReturnType(string $className, string $methodName, int $line, string $returnType): void
    {
        // 1. Missing return type declaration
        if ($returnType === '') {
            $this->addIssue(
                'error',
                $line,
                'missing_action_return_type',
                "Action method '{$className}::{$methodName}()' is missing a return type declaration. It must strictly declare ': ResponseInterface' or '\\Psr\\Http\\Message\\ResponseInterface'."
            );
            return;
        }

        // 2. Nullable return type (e.g. '?ResponseInterface', 'ResponseInterface|null')
        if (str_starts_with($returnType, '?') || preg_match('/\bnull\b/i', $returnType)) {
            $this->addIssue(
                'error',
                $line,
                'nullable_action_return_type',
                "Action method '{$className}::{$methodName}()' has nullable return type '{$returnType}'. Action handlers cannot return null; return strict 'ResponseInterface'."
            );
            return;
        }

        // 3. Prohibited primitive / non-response return types
        $prohibitedTypes = ['void', 'array', 'string', 'int', 'bool', 'float', 'mixed', 'object', 'iterable', 'never'];
        if (in_array(strtolower($returnType), $prohibitedTypes, true)) {
            $this->addIssue(
                'error',
                $line,
                'invalid_action_return_type',
                "Action method '{$className}::{$methodName}()' returns '{$returnType}'. In Yii 3, actions must strictly return 'Psr\\Http\\Message\\ResponseInterface'. Returning non-responses throws InvalidMiddlewareDefinitionException."
            );
            return;
        }

        // 4. Validate if return type implements or is ResponseInterface
        $cleanType = ltrim($returnType, '\\');
        $isResponse = false;

        if ($cleanType === 'ResponseInterface' || $cleanType === 'Psr\Http\Message\ResponseInterface') {
            $isResponse = true;
        } elseif (str_ends_with($cleanType, 'ResponseInterface')) {
            $isResponse = true;
        } elseif (in_array($cleanType, ['DataResponse', 'Response'], true)) {
            $isResponse = true; // Concrete PSR-7 / DataResponse implementations
        }

        // Check through imports
        if (!$isResponse && isset($this->useImports[$cleanType])) {
            $importedFqcn = $this->useImports[$cleanType];
            if ($importedFqcn === 'Psr\Http\Message\ResponseInterface' || str_ends_with($importedFqcn, 'ResponseInterface') || str_ends_with($importedFqcn, 'Response')) {
                $isResponse = true;
            }
        }

        if (!$isResponse) {
            $this->addIssue(
                'error',
                $line,
                'invalid_action_return_type',
                "Action method '{$className}::{$methodName}()' returns '{$returnType}'. Expected 'Psr\\Http\\Message\\ResponseInterface'."
            );
        }
    }

    private function checkConstructorDependencies(int $startIdx, int $endIdx, string $className): void
    {
        $buffer = '';
        $line = $this->tokens[$startIdx]->line;

        for ($i = $startIdx + 1; $i < $endIdx; $i++) {
            $t = $this->tokens[$i];
            if ($t->is(ord(','))) {
                $this->inspectConstructorParam($buffer, $line, $className);
                $buffer = '';
                continue;
            }
            if (!$t->is(T_WHITESPACE)) {
                $buffer .= ' ' . $t->text;
                $line = $t->line;
            }
        }

        if ($buffer !== '') {
            $this->inspectConstructorParam($buffer, $line, $className);
        }
    }

    private function inspectConstructorParam(string $paramSnippet, int $line, string $className): void
    {
        $paramSnippet = trim($paramSnippet);
        if ($paramSnippet === '') {
            return;
        }

        $prohibitedDependencies = [
            'ConnectionInterface' => 'Yiisoft\\Db\\Connection\\ConnectionInterface',
            'Connection' => 'Yiisoft\\Db\\Connection\\Connection',
            'PDO' => 'PDO',
            'ORMInterface' => 'Cycle\\ORM\\ORMInterface',
            'EntityManagerInterface' => 'Cycle\\ORM\\EntityManagerInterface',
            'ActiveRecord' => 'Yiisoft\\ActiveRecord\\ActiveRecord',
            'ActiveQuery' => 'Yiisoft\\ActiveRecord\\ActiveQuery',
        ];

        foreach ($prohibitedDependencies as $short => $fqcn) {
            if (preg_match('/\b' . preg_quote($short, '/') . '\b/', $paramSnippet)) {
                $this->addIssue(
                    'error',
                    $line,
                    'thin_action_db_injection',
                    "Direct injection of database connection/ORM ('$short') in Action constructor ('$className'). Presentation layer must not touch persistence; inject a RepositoryInterface or Application Use Case instead."
                );
            }
        }
    }

    private function checkThinActionToken(int $index, PhpToken $tok, string $className): void
    {
        // 1. Direct SQL / Command calls: ->createCommand(), ->queryAll(), ->queryOne(), etc.
        if ($tok->is(T_OBJECT_OPERATOR) || $tok->is(T_NULLSAFE_OBJECT_OPERATOR)) {
            $methodTok = $this->getNextNonWhitespaceToken($index);
            if ($methodTok !== null && $methodTok->is(T_STRING)) {
                $mName = strtolower($methodTok->text);

                if ($mName === 'createcommand') {
                    $this->addIssue(
                        'error',
                        $methodTok->line,
                        'thin_action_create_command',
                        "Direct database query execution '->createCommand()' in Action '$className'. Violates Thin Action principle: delegate persistence to Repositories or Use Cases."
                    );
                } elseif (in_array($mName, ['queryall', 'queryone', 'querycolumn', 'queryscalar', 'findbysql'], true)) {
                    $this->addIssue(
                        'error',
                        $methodTok->line,
                        'thin_action_direct_sql_query',
                        "Direct SQL query execution '->{$methodTok->text}()' in Action '$className'. Violates Thin Action principle: presentation layer must delegate persistence to Repositories."
                    );
                } elseif (in_array($mName, ['begintransaction', 'transaction', 'commit', 'rollback'], true)) {
                    $this->addIssue(
                        'error',
                        $methodTok->line,
                        'thin_action_transaction_management',
                        "Database transaction management '->{$methodTok->text}()' detected in Action '$className'. Presentation layer must never manage transactions; encapsulate in Use Cases or Unit of Work."
                    );
                }
            }
        }

        // 2. Direct static ActiveRecord calls: Model::find(), Model::findOne(), etc.
        if ($tok->is(T_DOUBLE_COLON)) {
            $callerTok = $this->getPreviousNonWhitespaceToken($index);
            $methodTok = $this->getNextNonWhitespaceToken($index);

            if ($callerTok !== null && $methodTok !== null && $methodTok->is(T_STRING)) {
                $mName = strtolower($methodTok->text);
                $caller = $callerTok->text;

                $arStaticMethods = ['find', 'findone', 'findall', 'deleteall', 'updateall', 'findbysql'];
                if (in_array($mName, $arStaticMethods, true)) {
                    // Ignore self::, static::, parent:: if inside internal helper
                    if (!in_array(strtolower($caller), ['self', 'static', 'parent', 'sort'], true)) {
                        $this->addIssue(
                            'error',
                            $methodTok->line,
                            'thin_action_ar_static_query',
                            "Direct ActiveRecord static query '{$caller}::{$methodTok->text}()' in Action '$className'. Violates Thin Action principle: delegate persistence to Repositories or Use Cases."
                        );
                    }
                }
            }
        }

        // 3. Direct Query Builder instantiation: new Query(), new ActiveQuery(), new Select()
        if ($tok->is(T_NEW)) {
            $classTok = $this->getNextNonWhitespaceToken($index);
            if ($classTok !== null && $classTok->is([T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED])) {
                $newClass = ltrim($classTok->text, '\\');
                if (in_array($newClass, ['Query', 'ActiveQuery', 'Select'], true)) {
                    $this->addIssue(
                        'error',
                        $classTok->line,
                        'thin_action_query_instantiation',
                        "Direct instantiation of query builder 'new $newClass()' in Action '$className'. Violates Thin Action principle: queries belong in Repository implementations."
                    );
                }
            }
        }
    }

    private function isActionClassName(string $className): bool
    {
        if (str_ends_with($className, 'Action') || str_ends_with($className, 'Controller')) {
            return true;
        }

        if (str_contains($this->namespace, 'Action') || str_contains($this->namespace, 'Controller')) {
            return true;
        }

        if (preg_match('/(Action|Controller)\.php$/i', basename($this->filePath))) {
            return true;
        }

        return false;
    }

    private function getNextNonWhitespaceToken(int $index): ?PhpToken
    {
        $idx = $this->getNextNonWhitespaceIndex($index);
        return $idx !== null ? $this->tokens[$idx] : null;
    }

    private function getNextNonWhitespaceIndex(int $index): ?int
    {
        for ($i = $index + 1; $i < $this->count; $i++) {
            if (!$this->tokens[$i]->is(T_WHITESPACE)) {
                return $i;
            }
        }
        return null;
    }

    private function getPreviousNonWhitespaceToken(int $index): ?PhpToken
    {
        for ($i = $index - 1; $i >= 0; $i--) {
            if (!$this->tokens[$i]->is(T_WHITESPACE)) {
                return $this->tokens[$i];
            }
        }
        return null;
    }

    private function getPreviousVariableToken(int $index): ?PhpToken
    {
        for ($i = $index - 1; $i >= max(0, $index - 10); $i--) {
            if ($this->tokens[$i]->is(T_VARIABLE)) {
                return $this->tokens[$i];
            }
        }
        return null;
    }

    private function addIssue(string $type, int $line, string $rule, string $message): void
    {
        $this->issues[] = [
            'type' => $type,
            'file' => $this->filePath,
            'line' => $line,
            'rule' => $rule,
            'message' => $message,
        ];
    }
}

// Script Entry Point
$verifier = new ActionVerifier($argv);
exit($verifier->run());
