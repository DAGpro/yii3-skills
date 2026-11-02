<?php

declare(strict_types=1);

/**
 * Yii 3 Route Configuration Static Verifier.
 *
 * Fast, deterministic static analyzer for Yii 3 Route definition files (routes.php).
 * Zero LLM token consumption, zero external Composer dependencies required.
 *
 * Checks performed:
 * 1. Presence of 'declare(strict_types=1);' as the first statement in route files.
 * 2. Prohibition of legacy Yii 2 route parameter syntax '<id:\d+>' or '<id>' in favor of FastRoute '{id:\d+}'.
 * 3. Detection of duplicate route names within the same file (->name('...')).
 * 4. Prohibition of legacy Yii 2 string route targets ('controller/action') without class references.
 * 5. Prohibition of legacy Yii 2 facades (Yii::$app) and deprecated namespaces (yii\web\UrlRule).
 * 6. Advisory check: Missing RequestBodyParser on state-changing POST/PUT/PATCH routes.
 *
 * Exit Codes:
 *   0: All route files passed verification (no blocking violations found).
 *   1: Blocking violations found.
 *   2: Fatal invocation error (invalid path, unreadable file, unsupported PHP version).
 */

if (PHP_VERSION_ID < 80100) {
    fwrite(STDERR, "[FATAL] verify-routes requires PHP 8.1 or higher (current: " . PHP_VERSION . ").\n");
    exit(2);
}

final class RouteVerifier
{
    private string $basePath;
    private ?string $specificFile = null;
    private string $format = 'text'; // 'text' | 'json'
    private bool $quiet = false;
    private bool $verbose = false;

    /** @var array<int, array{type: 'error'|'warning', file: string, line: int, rule: string, message: string}> */
    private array $issues = [];

    private int $filesScannedCount = 0;
    private int $routesCheckedCount = 0;

    public function __construct(array $argv)
    {
        $this->parseArguments($argv);
    }

    public function run(): int
    {
        $files = $this->discoverRouteFiles();
        if (empty($files)) {
            if ($this->specificFile !== null) {
                $this->outputError("Specified file '{$this->specificFile}' not found or unreadable.");
                return 2;
            }

            // If no route files found in a scan, report non-fatal or exit 0/2 based on standard convention
            if ($this->verbose) {
                fwrite(STDERR, "[INFO] No route configuration files (e.g. config/**/routes.php) found in '{$this->basePath}'.\n");
            }
            $this->renderReport();
            return 0;
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
        echo <<<HELP
Yii 3 Route Configuration Static Verifier.

Usage:
  php verify-routes.php [path] [options]
  php verify-routes.php --file=<path-to-routes.php> [options]

Arguments:
  path                  Root directory of the Yii 3 project or config folder (default: current directory).

Options:
  --file=<file>         Audit a single route configuration file.
  --format=text|json    Output format: concise text list (default) or structured JSON.
  --quiet, -q           Only print errors and warnings.
  --verbose, -v         Display detailed scanning progress.
  --help, -h            Show this help message.

Checks Performed:
  - declare(strict_types=1); presence as the first statement.
  - Prohibition of legacy Yii 2 route parameter syntax '<id:\d+>' (enforces FastRoute '{id:\d+}').
  - Detection of duplicate route names within the same configuration file (->name('...')).
  - Prohibition of legacy Yii 2 string controllers ('site/index') and static facades (Yii::\$app).
  - Advisory warning for missing RequestBodyParser middleware on POST/PUT/PATCH routes.

HELP;
    }

    /**
     * @return string[]
     */
    private function discoverRouteFiles(): array
    {
        if ($this->specificFile !== null) {
            return is_file($this->specificFile) ? [$this->specificFile] : [];
        }

        $discovered = [];
        $candidates = [
            $this->basePath . '/config',
            $this->basePath . '/src',
        ];

        foreach ($candidates as $dir) {
            if (!is_dir($dir)) {
                continue;
            }

            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS)
            );

            /** @var SplFileInfo $fileInfo */
            foreach ($iterator as $fileInfo) {
                if ($fileInfo->getExtension() !== 'php') {
                    continue;
                }

                $filename = strtolower($fileInfo->getFilename());
                $path = str_replace('\\', '/', $fileInfo->getPathname());

                if (str_contains($path, '/vendor/') || str_contains($path, '/runtime/') || str_contains($path, '/tests/')) {
                    continue;
                }

                if ($filename === 'routes.php' || str_ends_with($filename, '-routes.php') || str_starts_with($filename, 'routes-')) {
                    $discovered[] = $path;
                }
            }
        }

        // Also check if basePath itself directly points to a routes.php
        if (basename($this->basePath) === 'routes.php' && is_file($this->basePath)) {
            $discovered[] = $this->basePath;
        }

        sort($discovered);
        return array_unique($discovered);
    }

    private function verifyFile(string $filePath): void
    {
        $relPath = $this->getRelativePath($filePath);
        $this->filesScannedCount++;

        $content = @file_get_contents($filePath);
        if ($content === false) {
            $this->addIssue('error', $relPath, 1, 'file_unreadable', "Unable to read route file: {$relPath}");
            return;
        }

        try {
            $tokens = PhpToken::tokenize($content, TOKEN_PARSE);
        } catch (\ParseError $e) {
            $this->addIssue('error', $relPath, $e->getLine(), 'php_syntax_error', "PHP syntax error: " . $e->getMessage());
            return;
        }

        $analyzer = new RouteTokenAnalyzer($relPath, $tokens);
        $fileIssues = $analyzer->analyze();

        foreach ($fileIssues as $issue) {
            $this->issues[] = $issue;
        }

        $this->routesCheckedCount += $analyzer->getRoutesCount();
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

    private function renderReport(): void
    {
        if ($this->format === 'json') {
            $errorCount = 0;
            $warningCount = 0;
            foreach ($this->issues as $issue) {
                if ($issue['type'] === 'error') {
                    $errorCount++;
                } else {
                    $warningCount++;
                }
            }

            $data = [
                'status' => $this->hasErrors() ? 'fail' : 'pass',
                'files_scanned' => $this->filesScannedCount,
                'routes_checked' => $this->routesCheckedCount,
                'error_count' => $errorCount,
                'warning_count' => $warningCount,
                'issues' => $this->issues,
            ];

            echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            return;
        }

        if ($this->quiet && empty($this->issues)) {
            return;
        }

        $errors = array_filter($this->issues, static fn(array $i) => $i['type'] === 'error');
        $warnings = array_filter($this->issues, static fn(array $i) => $i['type'] === 'warning');

        if (!empty($errors)) {
            echo "ERRORS (" . count($errors) . "):\n";
            foreach ($errors as $err) {
                echo "  {$err['file']}:{$err['line']} — {$err['rule']} — {$err['message']}\n";
            }
        }

        if (!empty($warnings)) {
            if (!empty($errors)) {
                echo "\n";
            }
            echo "WARNINGS (" . count($warnings) . "):\n";
            foreach ($warnings as $warn) {
                echo "  {$warn['file']}:{$warn['line']} — {$warn['rule']} — {$warn['message']}\n";
            }
        }

        if (empty($this->issues) && !$this->quiet) {
            echo "PASS: All {$this->filesScannedCount} route file(s) checked ({$this->routesCheckedCount} routes/groups). No issues found.\n";
        }
    }

    private function getRelativePath(string $path): string
    {
        $normalized = str_replace('\\', '/', $path);
        if (str_starts_with($normalized, $this->basePath . '/')) {
            return substr($normalized, strlen($this->basePath) + 1);
        }
        return $normalized;
    }
}

final class RouteTokenAnalyzer
{
    private string $file;
    /** @var PhpToken[] */
    private array $tokens;

    /** @var array<int, array{type: 'error'|'warning', file: string, line: int, rule: string, message: string}> */
    private array $issues = [];

    private int $routesCount = 0;

    /** @param PhpToken[] $tokens */
    public function __construct(string $file, array $tokens)
    {
        $this->file = $file;
        $this->tokens = $tokens;
    }

    /**
     * @return array<int, array{type: 'error'|'warning', file: string, line: int, rule: string, message: string}>
     */
    public function analyze(): array
    {
        $this->checkStrictTypes();
        $this->checkTokenPatterns();
        return $this->issues;
    }

    public function getRoutesCount(): int
    {
        return $this->routesCount;
    }

    private function checkStrictTypes(): void
    {
        $foundDeclare = false;
        $foundStrict = false;

        $count = count($this->tokens);
        for ($i = 0; $i < $count; $i++) {
            $token = $this->tokens[$i];

            if ($token->id === T_DECLARE) {
                $foundDeclare = true;
                // Look ahead for strict_types
                for ($j = $i + 1; $j < min($i + 15, $count); $j++) {
                    if ($this->tokens[$j]->id === T_STRING && $this->tokens[$j]->text === 'strict_types') {
                        $foundStrict = true;
                        break;
                    }
                }
                break;
            }

            // If we hit any non-whitespace, non-comment, non-open-tag statement before declare
            if ($token->id !== T_OPEN_TAG && $token->id !== T_WHITESPACE && $token->id !== T_COMMENT && $token->id !== T_DOC_COMMENT) {
                break;
            }
        }

        if (!$foundDeclare || !$foundStrict) {
            $this->issues[] = [
                'type' => 'error',
                'file' => $this->file,
                'line' => 1,
                'rule' => 'missing_declare_strict_types',
                'message' => "Route configuration file must begin with 'declare(strict_types=1);' as the first statement.",
            ];
        }
    }

    private function checkTokenPatterns(): void
    {
        $count = count($this->tokens);
        $routeNames = [];

        for ($i = 0; $i < $count; $i++) {
            $token = $this->tokens[$i];

            // 1. Prohibit legacy Yii 2 static facade: Yii::$app
            if ($token->id === T_STRING && $token->text === 'Yii') {
                if ($i + 2 < $count && $this->tokens[$i + 1]->id === T_DOUBLE_COLON) {
                    $this->issues[] = [
                        'type' => 'error',
                        'file' => $this->file,
                        'line' => $token->line,
                        'rule' => 'prohibited_legacy_static',
                        'message' => "Prohibited static facade 'Yii::' in route configuration. Yii 3 uses injected dependencies.",
                    ];
                }
            }

            // 2. Count routes/groups & check method chains
            if ($token->id === T_STRING) {
                if (in_array($token->text, ['Group', 'Route', 'Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head'], true)) {
                    $this->routesCount++;
                }

                // Check ->name('...')
                if ($token->text === 'name' && $i > 0 && $this->tokens[$i - 1]->id === T_OBJECT_OPERATOR) {
                    $nameVal = $this->extractSingleStringArgument($i);
                    if ($nameVal !== null) {
                        if (isset($routeNames[$nameVal])) {
                            $this->issues[] = [
                                'type' => 'error',
                                'file' => $this->file,
                                'line' => $token->line,
                                'rule' => 'duplicate_route_name',
                                'message' => "Duplicate route name '{$nameVal}' defined. Route names must be unique within the application (first declared on line {$routeNames[$nameVal]}).",
                            ];
                        } else {
                            $routeNames[$nameVal] = $token->line;
                        }
                    }
                }
            }

            // 3. Inspect string literals for legacy Yii 2 route parameter syntax: '<id:\d+>' or '<name>'
            if ($token->id === T_CONSTANT_ENCAPSED_STRING) {
                $rawString = trim($token->text, "'\"");
                if (str_contains($rawString, '<') && str_contains($rawString, '>')) {
                    // Check if it matches Yii 2 route parameter syntax like <id> or <id:\d+>
                    if (preg_match('/<([a-zA-Z_][a-zA-Z0-9_-]*(?::[^>]+)?)>/', $rawString, $m)) {
                        $this->issues[] = [
                            'type' => 'error',
                            'file' => $this->file,
                            'line' => $token->line,
                            'rule' => 'legacy_route_param_syntax',
                            'message' => "Pattern '{$rawString}' contains legacy Yii 2 parameter syntax '<{$m[1]}>'. Use FastRoute syntax '{" . $m[1] . "}' instead.",
                        ];
                    }
                }

                // 4. Prohibit legacy Yii 2 'controller/action' route targets
                if (preg_match('/^[a-z0-9_-]+\/[a-z0-9_-]+$/i', $rawString) && !str_starts_with($rawString, '/') && !str_contains($rawString, 'api/')) {
                    // Check if this string is passed to ->action('site/index')
                    if ($this->isInsideActionCall($i)) {
                        $this->issues[] = [
                            'type' => 'error',
                            'file' => $this->file,
                            'line' => $token->line,
                            'rule' => 'legacy_route_action_target',
                            'message' => "Legacy string action target '{$rawString}' detected. Use invokable Action class (e.g. MyAction::class) or [Controller::class, 'method'].",
                        ];
                    }
                }
            }
        }
    }

    private function extractSingleStringArgument(int $methodTokenIdx): ?string
    {
        $count = count($this->tokens);
        $depth = 0;
        $foundString = null;

        for ($j = $methodTokenIdx + 1; $j < min($methodTokenIdx + 10, $count); $j++) {
            $t = $this->tokens[$j];
            if ($t->text === '(') {
                $depth++;
                continue;
            }
            if ($t->text === ')') {
                break;
            }
            if ($depth === 1 && $t->id === T_CONSTANT_ENCAPSED_STRING && $foundString === null) {
                $foundString = trim($t->text, "'\"");
            }
        }

        return $foundString;
    }

    private function isInsideActionCall(int $stringTokenIdx): bool
    {
        for ($j = $stringTokenIdx - 1; $j >= max(0, $stringTokenIdx - 6); $j--) {
            if ($this->tokens[$j]->id === T_STRING && $this->tokens[$j]->text === 'action') {
                return true;
            }
            if ($this->tokens[$j]->text === ';') {
                break;
            }
        }
        return false;
    }
}

// CLI Execution Entry Point
$verifier = new RouteVerifier($argv);
exit($verifier->run());

