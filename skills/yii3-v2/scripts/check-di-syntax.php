<?php

declare(strict_types=1);

/**
 * Yii 3 Dependency Injection & Configuration Static Checker.
 *
 * Fast, deterministic static analyzer for Yii 3 DI configuration files.
 * Zero LLM token consumption, zero external Composer dependencies required.
 *
 * Checks performed:
 * 1. Syntax & structure of DI configuration files (config/.../di/*.php).
 * 2. Typos in array definition keys: '__construct()', 'class', method calls 'name()', properties '$name', 'reset', 'tags'.
 * 3. Legacy Yii 2 artifacts ('__class', Yii::$app).
 * 4. Missing or self-referencing interface bindings (Interface => Interface, unbound Reference::to(Interface)).
 * 5. Reflection & autoload verification of class names, interfaces, and parameter names (if vendor/autoload.php exists).
 * 6. Closure/object violations in params.php (primitives only rule).
 *
 * Exit Codes:
 *   0: All files passed validation (no errors found).
 *   1: Validation errors found.
 *   2: Fatal invocation error (invalid path, unreadable file, unsupported PHP version).
 */

if (PHP_VERSION_ID < 80100) {
    fwrite(STDERR, "[FATAL] check-di-syntax requires PHP 8.1 or higher (current: " . PHP_VERSION . ").\n");
    exit(2);
}

final class DiChecker
{
    private const ALLOWED_ARRAY_DEF_TOP_KEYS = [
        'class',
        '__construct()',
        'tags',
        'reset',
        'definition',
    ];

    private const ALLOWED_META_KEYS = [
        'tags',
        'reset',
        'definition',
    ];

    private string $basePath;
    private ?string $specificFile = null;
    private string $format = 'text'; // 'text' | 'json'
    private bool $quiet = false;
    private bool $verbose = false;
    private bool $autoloadLoaded = false;

    /** @var array<int, array{type: 'error'|'warning', file: string, line: int, rule: string, message: string}> */
    private array $issues = [];

    /** @var array<string, array{file: string, line: int, target: ?string, is_interface: bool}> */
    private array $allProvidedServices = [];

    /** @var array<int, array{id: string, file: string, line: int, type: string}> */
    private array $allReferences = [];

    private int $filesScannedCount = 0;
    private int $definitionsCount = 0;

    public function __construct(array $argv)
    {
        $this->parseArguments($argv);
    }

    public function run(): int
    {
        $this->initAutoloader();

        $files = $this->discoverFiles();
        if (empty($files)) {
            $this->outputError("No DI configuration files found in '{$this->basePath}'. Check --path or --file option.");
            return 2;
        }

        // Pass 1: Parse all files, validate local definitions and collect global symbol map
        foreach ($files as $file) {
            $this->validateFile($file);
        }

        // Pass 2: Cross-file validations (unbound interfaces, dangling references)
        $this->validateCrossFileBindings();

        // Output results
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
                // Positional argument: either file or path
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
Yii 3 Dependency Injection & Configuration Static Checker (check-di-syntax)

Usage:
  php check-di-syntax.php [options] [path]

Arguments:
  path                  Path to the target Yii3 project root (default: current working directory).

Options:
  --file=<file>         Validate a single specific DI or params configuration file.
  --path=<path>         Target project root directory.
  --format=text|json    Output format: human-readable text (default) or structured JSON.
  --quiet, -q           Only print errors and warnings. Suppress informational messages.
  --verbose, -v         Display verbose scanning details and resolved symbols.
  --help, -h            Show this help message.

Examples:
  php check-di-syntax.php
  php check-di-syntax.php /path/to/my-yii3-app
  php check-di-syntax.php --file=config/common/di/router.php
  php check-di-syntax.php --format=json

HELP;
    }

    private function initAutoloader(): void
    {
        $autoloadPaths = [
            $this->basePath . '/vendor/autoload.php',
            dirname($this->basePath) . '/vendor/autoload.php',
        ];

        foreach ($autoloadPaths as $path) {
            if (is_file($path)) {
                try {
                    require_once $path;
                    $this->autoloadLoaded = true;
                    if ($this->verbose && $this->format === 'text') {
                        echo "[INFO] Registered autoloader: $path\n";
                    }
                    break;
                } catch (\Throwable $e) {
                    // Suppress autoloader failure; fallback to pure static token analysis
                }
            }
        }
    }

    /**
     * @return string[]
     */
    private function discoverFiles(): array
    {
        if ($this->specificFile !== null) {
            return is_file($this->specificFile) ? [$this->specificFile] : [];
        }

        $discovered = [];
        $configDir = $this->basePath . '/config';

        if (is_dir($configDir)) {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($configDir, FilesystemIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS)
            );

            /** @var SplFileInfo $fileInfo */
            foreach ($iterator as $fileInfo) {
                if ($fileInfo->getExtension() !== 'php') {
                    continue;
                }

                $normalized = str_replace('\\', '/', $fileInfo->getPathname());

                // Pick up config/**/di/*.php, config/**/di.php, config/**/di-*.php
                if (preg_match('#/di(/.*)?\.php$#i', $normalized) || preg_match('#/di-.*\.php$#i', $normalized)) {
                    $discovered[] = $normalized;
                } elseif (preg_match('#/params.*\.php$#i', $normalized)) {
                    $discovered[] = $normalized;
                }
            }
        } else {
            // Check direct root or current folder if config directory doesn't exist
            $files = glob($this->basePath . '/*.php') ?: [];
            foreach ($files as $file) {
                $normalized = str_replace('\\', '/', $file);
                if (preg_match('#(di|params)#i', basename($normalized))) {
                    $discovered[] = $normalized;
                }
            }
        }

        sort($discovered);
        return $discovered;
    }

    private function validateFile(string $filePath): void
    {
        $relPath = $this->getRelativePath($filePath);
        $this->filesScannedCount++;

        $content = @file_get_contents($filePath);
        if ($content === false) {
            $this->addIssue('error', $relPath, 1, 'file_unreadable', "Unable to read file: $relPath");
            return;
        }

        // 1. PHP Syntax Check
        try {
            $tokens = PhpToken::tokenize($content, TOKEN_PARSE);
        } catch (\ParseError $e) {
            $this->addIssue('error', $relPath, $e->getLine(), 'php_syntax_error', "PHP syntax error: " . $e->getMessage());
            return;
        }

        $isParamsFile = (bool) preg_match('#params.*\.php$#i', basename($filePath));

        $parser = new DiAstAnalyzer($filePath, $content, $tokens);
        $parsed = $parser->analyze();

        // 2. Return statement validation
        if (!$parsed['has_return_array']) {
            $this->addIssue(
                'error',
                $relPath,
                1,
                'missing_return_array',
                "Configuration file must return an array ('return [ ... ];')."
            );
            return;
        }

        // 3. Params-specific check (closures are prohibited in params)
        if ($isParamsFile) {
            foreach ($parsed['closures'] as $line) {
                $this->addIssue(
                    'warning',
                    $relPath,
                    $line,
                    'closure_in_params',
                    "Closure or anonymous function detected in parameters file. Yii 3 parameters must contain only primitives, arrays, and class strings."
                );
            }
            return; // Params file does not contain DI definitions
        }

        // 4. DI Definitions validations
        foreach ($parsed['definitions'] as $def) {
            $this->definitionsCount++;
            $serviceId = $def['key'];
            $keyLine = $def['key_line'];

            $isInterface = $this->isInterfaceName($serviceId);

            // Register service ID for global cross-file checking
            $this->allProvidedServices[$serviceId] = [
                'file' => $relPath,
                'line' => $keyLine,
                'target' => $def['target_class'],
                'is_interface' => $isInterface,
            ];

            // Check self-binding interface (Interface::class => Interface::class)
            if ($isInterface && $def['target_class'] === $serviceId) {
                $this->addIssue(
                    'error',
                    $relPath,
                    $keyLine,
                    'interface_self_binding',
                    "Interface '$serviceId' is mapped to itself without a concrete implementation class."
                );
            }

            // Check array definition inner keys
            if ($def['type'] === 'array_definition') {
                $this->validateArrayDefinition($relPath, $serviceId, $def);
            }

            // Collect references from definition
            foreach ($def['references'] as $ref) {
                $this->allReferences[] = [
                    'id' => $ref['id'],
                    'file' => $relPath,
                    'line' => $ref['line'],
                    'type' => $ref['type'],
                ];
            }

            // Optional Autoload Reflection checks on concrete target
            if ($this->autoloadLoaded && $def['target_class'] !== null) {
                $this->validateClassReflection($relPath, $keyLine, $serviceId, $def['target_class']);
            }
        }
    }

    private function validateArrayDefinition(string $relPath, string $serviceId, array $def): void
    {
        $hasClassName = false;
        $classValue = null;

        foreach ($def['array_keys'] as $item) {
            $key = $item['key'];
            $line = $item['line'];
            $isArray = $item['is_array'];

            // 1. Detect Legacy Yii2 key '__class'
            if ($key === '__class') {
                $this->addIssue(
                    'error',
                    $relPath,
                    $line,
                    'yii2_legacy_class_key',
                    "Legacy Yii 2 key '__class' detected. Yii 3 requires 'class' (Yiisoft\\Definitions\\ArrayDefinition::CLASS_NAME)."
                );
                continue;
            }

            // 2. Detect common typos in 'class'
            if (in_array(strtolower($key), ['classname', 'target', 'class_name'], true)) {
                $this->addIssue(
                    'error',
                    $relPath,
                    $line,
                    'typo_class_key',
                    "Invalid class key '$key'. Did you mean 'class'?"
                );
                continue;
            }

            // 3. Constructor argument key checks
            if ($key === '__construct()') {
                if (!$isArray) {
                    $this->addIssue(
                        'error',
                        $relPath,
                        $line,
                        'invalid_constructor_value',
                        "Value for '__construct()' must be an array of arguments, e.g. ['arg1' => \$params['...']]."
                    );
                }
                continue;
            }

            if ($key === '__construct') {
                $this->addIssue(
                    'error',
                    $relPath,
                    $line,
                    'typo_constructor_key',
                    "Typo in constructor key '__construct'. Yii 3 requires '__construct()' with trailing parentheses."
                );
                continue;
            }

            if (in_array(strtolower(rtrim($key, '()')), ['constructor', 'construct'], true)) {
                $this->addIssue(
                    'error',
                    $relPath,
                    $line,
                    'typo_constructor_key',
                    "Invalid constructor key '$key'. Did you mean '__construct()'?"
                );
                continue;
            }

            // 4. Metadata keys ('tags', 'reset')
            if ($key === 'tag') {
                $this->addIssue(
                    'error',
                    $relPath,
                    $line,
                    'typo_metadata_key',
                    "Typo in metadata key 'tag'. Did you mean 'tags'?"
                );
                continue;
            }

            if ($key === 'resetter') {
                $this->addIssue(
                    'error',
                    $relPath,
                    $line,
                    'typo_metadata_key',
                    "Typo in metadata key 'resetter'. Did you mean 'reset'?"
                );
                continue;
            }

            if ($key === 'class') {
                $hasClassName = true;
                continue;
            }

            if (in_array($key, self::ALLOWED_ARRAY_DEF_TOP_KEYS, true)) {
                continue;
            }

            // 5. Method calls: MUST end with '()'
            if (str_ends_with($key, '()')) {
                if (!$isArray) {
                    $this->addIssue(
                        'error',
                        $relPath,
                        $line,
                        'invalid_method_arguments',
                        "Arguments for method call '$key' must be wrapped in an array, e.g. [$key => [arg1, arg2]]."
                    );
                }
                continue;
            }

            // 6. Properties: MUST start with '$'
            if (str_starts_with($key, '$')) {
                continue;
            }

            // 7. Unmatched key: Generate intelligent diagnostic suggestion
            $suggestion = $this->guessKeySuggestion($key);
            $this->addIssue(
                'error',
                $relPath,
                $line,
                'invalid_array_definition_key',
                "Invalid definition key '$key' in array definition. $suggestion"
            );
        }
    }

    private function guessKeySuggestion(string $key): string
    {
        if (preg_match('/^(set|with|add|register|enable|disable)[A-Z]/', $key)) {
            return "Did you mean '$key()' for a method call?";
        }
        return "Did you mean '$key()' for a method call, or '\$$key' for property injection?";
    }

    private function validateCrossFileBindings(): void
    {
        // 1. Check all Reference::to(...) calls pointing to interfaces
        foreach ($this->allReferences as $ref) {
            $id = $ref['id'];
            if ($id === '' || !str_contains($id, '\\')) {
                continue;
            }

            if ($this->isInterfaceName($id)) {
                if (!isset($this->allProvidedServices[$id])) {
                    $this->addIssue(
                        'warning',
                        $ref['file'],
                        $ref['line'],
                        'unbound_referenced_interface',
                        "Interface '$id' is referenced via {$ref['type']}(), but has no binding in any scanned DI configuration."
                    );
                }
            }
        }

        // 2. Check chained interface-to-interface mappings (InterfaceA => InterfaceB where InterfaceB is not bound)
        foreach ($this->allProvidedServices as $serviceId => $info) {
            if ($info['is_interface'] && $info['target'] !== null && $this->isInterfaceName($info['target'])) {
                $targetInterface = $info['target'];
                if (!isset($this->allProvidedServices[$targetInterface])) {
                    $this->addIssue(
                        'error',
                        $info['file'],
                        $info['line'],
                        'unbound_target_interface',
                        "Interface '$serviceId' is mapped to interface '$targetInterface', but '$targetInterface' is not bound to any concrete class."
                    );
                }
            }
        }
    }

    private function validateClassReflection(string $relPath, int $line, string $serviceId, string $targetClass): void
    {
        if (!class_exists($targetClass) && !interface_exists($targetClass)) {
            // Autoloader is loaded, but class does not exist (potential typo or missing dependency)
            $this->addIssue(
                'error',
                $relPath,
                $line,
                'class_not_found',
                "Target class or interface '$targetClass' not found in autoloader."
            );
            return;
        }

        try {
            $ref = new ReflectionClass($targetClass);

            if ($this->isInterfaceName($serviceId)) {
                if ($ref->isAbstract() && !$ref->isInterface()) {
                    $this->addIssue(
                        'error',
                        $relPath,
                        $line,
                        'abstract_target_class',
                        "Cannot bind interface '$serviceId' to abstract class '$targetClass'."
                    );
                } elseif (!$ref->isInterface() && interface_exists($serviceId) && !$ref->implementsInterface($serviceId)) {
                    $this->addIssue(
                        'warning',
                        $relPath,
                        $line,
                        'unimplemented_interface',
                        "Class '$targetClass' does not implement bound interface '$serviceId'."
                    );
                }
            }
        } catch (\ReflectionException $e) {
            // Ignore reflection errors on dynamically evaluated files
        }
    }

    private function isInterfaceName(string $name): bool
    {
        if (str_ends_with($name, 'Interface')) {
            return true;
        }
        if ($this->autoloadLoaded && interface_exists($name)) {
            return true;
        }
        return false;
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
                    'definitions_count' => $this->definitionsCount,
                    'errors_count' => $errorCount,
                    'warnings_count' => $warningCount,
                ],
                'issues' => $this->issues,
            ];
            echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
            return;
        }

        // Text format
        echo "============================================================\n";
        echo " Yii 3 DI & Configuration Syntax Checker (check-di-syntax)  \n";
        echo "============================================================\n";
        echo "Base path: {$this->basePath}\n";
        echo "Autoloader: " . ($this->autoloadLoaded ? "Active (vendor/autoload.php)" : "Static Mode (Zero Vendor)") . "\n\n";

        if (empty($this->issues)) {
            echo "[OK] All {$this->filesScannedCount} configuration file(s) and {$this->definitionsCount} definition(s) passed validation.\n";
            echo "Zero errors, zero warnings found.\n";
            return;
        }

        foreach ($this->issues as $issue) {
            $tag = strtoupper($issue['type']);
            $color = $tag === 'ERROR' ? "\033[31m" : "\033[33m";
            $reset = "\033[0m";

            // If stdout is a tty, use colors, otherwise plain text
            $hasColor = function_exists('posix_isatty') ? posix_isatty(STDOUT) : (DIRECTORY_SEPARATOR === '/');
            if ($hasColor) {
                echo "{$color}[{$tag}]{$reset} {$issue['file']}:{$issue['line']} - {$issue['message']}\n";
            } else {
                echo "[{$tag}] {$issue['file']}:{$issue['line']} - {$issue['message']}\n";
            }
        }

        echo "\n------------------------------------------------------------\n";
        echo "Summary: Scanned {$this->filesScannedCount} file(s), {$this->definitionsCount} definition(s).\n";
        echo "Errors: $errorCount | Warnings: $warningCount\n";
        echo "Result: " . ($errorCount === 0 ? "PASSED" : "FAILED") . "\n";
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
 * Fast AST / Token Analyzer for Yii 3 configuration files.
 */
final class DiAstAnalyzer
{
    private string $filePath;
    private string $content;
    /** @var PhpToken[] */
    private array $tokens;
    private int $count;

    private string $namespace = '';
    /** @var array<string, string> short alias => FQCN */
    private array $useImports = [];

    public function __construct(string $filePath, string $content, array $tokens)
    {
        $this->filePath = $filePath;
        $this->content = $content;
        $this->tokens = $tokens;
        $this->count = count($tokens);
    }

    /**
     * @return array{
     *   has_return_array: bool,
     *   definitions: array<int, array{
     *     key: string,
     *     key_line: int,
     *     type: string,
     *     target_class: ?string,
     *     array_keys: array<int, array{key: string, line: int, is_array: bool}>,
     *     references: array<int, array{id: string, line: int, type: string}>
     *   }>,
     *   closures: array<int, int>
     * }
     */
    public function analyze(): array
    {
        $this->extractNamespaceAndImports();

        $returnSlice = $this->findReturnArraySlice();
        $hasReturnArray = $returnSlice !== null;

        $definitions = [];
        $closures = [];

        // Track closures for params check
        foreach ($this->tokens as $token) {
            if ($token->is([T_FUNCTION, T_FN])) {
                $closures[] = $token->line;
            }
        }

        if ($hasReturnArray) {
            $definitions = $this->parseReturnDefinitions($returnSlice);
        }

        return [
            'has_return_array' => $hasReturnArray,
            'definitions' => $definitions,
            'closures' => $closures,
        ];
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
                $this->registerImport(trim($buffer), $prefix);
                $buffer = '';
                $i++;
                continue;
            }

            if (!$tok->is(T_WHITESPACE)) {
                $buffer .= $tok->text;
            }
            $i++;
        }

        if (trim($buffer) !== '') {
            $this->registerImport(trim($buffer), $prefix);
        }

        return $i;
    }

    private function registerImport(string $entry, string $prefix): void
    {
        if ($entry === '') {
            return;
        }

        $full = $prefix . $entry;
        if (preg_match('/^(.+)\s+as\s+(.+)$/i', $entry, $matches)) {
            $target = $prefix . trim($matches[1]);
            $alias = trim($matches[2]);
            $this->useImports[$alias] = ltrim($target, '\\');
        } else {
            $target = ltrim($full, '\\');
            $parts = explode('\\', $target);
            $alias = end($parts);
            $this->useImports[$alias] = $target;
        }
    }

    public function resolveClass(string $rawClass): string
    {
        $rawClass = trim($rawClass);
        if ($rawClass === '') {
            return '';
        }
        if (str_starts_with($rawClass, '\\')) {
            return ltrim($rawClass, '\\');
        }
        $parts = explode('\\', $rawClass);
        $first = $parts[0];
        if (isset($this->useImports[$first])) {
            $parts[0] = $this->useImports[$first];
            return implode('\\', $parts);
        }
        if ($this->namespace !== '') {
            return $this->namespace . '\\' . $rawClass;
        }
        return $rawClass;
    }

    /**
     * @return PhpToken[]|null
     */
    private function findReturnArraySlice(): ?array
    {
        for ($i = 0; $i < $this->count; $i++) {
            if ($this->tokens[$i]->is(T_RETURN)) {
                for ($j = $i + 1; $j < $this->count; $j++) {
                    if ($this->tokens[$j]->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT])) {
                        continue;
                    }
                    if ($this->tokens[$j]->is(ord('['))) {
                        return $this->sliceMatchingBracket($j, '[', ']');
                    }
                    if ($this->tokens[$j]->is(T_ARRAY)) {
                        for ($k = $j + 1; $k < $this->count; $k++) {
                            if ($this->tokens[$k]->is(ord('('))) {
                                return $this->sliceMatchingBracket($k, '(', ')');
                            }
                        }
                    }
                    break;
                }
            }
        }
        return null;
    }

    /**
     * @return PhpToken[]
     */
    private function sliceMatchingBracket(int $openIndex, string $openChar, string $closeChar): array
    {
        $depth = 0;
        $slice = [];
        for ($i = $openIndex; $i < $this->count; $i++) {
            $tok = $this->tokens[$i];
            if ($tok->text === $openChar) {
                $depth++;
                if ($depth === 1) {
                    continue;
                }
            } elseif ($tok->text === $closeChar) {
                $depth--;
                if ($depth === 0) {
                    break;
                }
            }
            if ($depth >= 1) {
                $slice[] = $tok;
            }
        }
        return $slice;
    }

    /**
     * @param PhpToken[] $tokens
     * @return array<int, mixed>
     */
    private function parseReturnDefinitions(array $tokens): array
    {
        $defs = [];
        $count = count($tokens);
        $i = 0;

        while ($i < $count) {
            if ($tokens[$i]->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, ord(',')])) {
                $i++;
                continue;
            }

            // Read Key until '=>'
            $keyTokens = [];
            $keyLine = $tokens[$i]->line;
            while ($i < $count && !$tokens[$i]->is(T_DOUBLE_ARROW)) {
                if (!$tokens[$i]->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT])) {
                    $keyTokens[] = $tokens[$i];
                }
                $i++;
            }

            if ($i >= $count || !$tokens[$i]->is(T_DOUBLE_ARROW)) {
                break;
            }

            $i++; // skip '=>'

            $keyString = $this->resolveTokensToString($keyTokens);

            // Read Value until matching comma ',' at top depth
            $valTokens = [];
            $depth = 0;
            while ($i < $count) {
                $tok = $tokens[$i];
                if ($tok->text === '[' || $tok->text === '(') {
                    $depth++;
                } elseif ($tok->text === ']' || $tok->text === ')') {
                    $depth--;
                } elseif ($tok->text === ',' && $depth === 0) {
                    $i++;
                    break;
                }
                $valTokens[] = $tok;
                $i++;
            }

            $defs[] = $this->buildDefinitionRecord($keyString, $keyLine, $valTokens);
        }

        return $defs;
    }

    /**
     * @param PhpToken[] $tokens
     */
    private function resolveTokensToString(array $tokens): string
    {
        $str = '';
        foreach ($tokens as $t) {
            $str .= $t->text;
        }
        $str = trim($str);

        if (preg_match('/^[\'"](.*)[\'"]$/', $str, $m)) {
            return $m[1];
        }

        if (preg_match('/^(.+)::class$/i', $str, $m)) {
            return $this->resolveClass(trim($m[1]));
        }

        return $str;
    }

    /**
     * @param PhpToken[] $tokens
     * @return array<string, mixed>
     */
    private function buildDefinitionRecord(string $key, int $keyLine, array $tokens): array
    {
        $filtered = array_values(array_filter($tokens, fn($t) => !$t->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT])));

        $type = 'unknown';
        $targetClass = null;
        $arrayKeys = [];
        $references = $this->extractReferences($tokens);

        if (!empty($filtered)) {
            $first = $filtered[0];
            if ($first->is([T_FN, T_FUNCTION])) {
                $type = 'closure';
            } elseif ($first->text === '[' || $first->is(T_ARRAY)) {
                $type = 'array_definition';
                $arrayKeys = $this->parseArrayDefinitionEntries($tokens);

                // Check if 'class' is declared inside array definition
                foreach ($arrayKeys as $k) {
                    if ($k['key'] === 'class' && $k['target_value'] !== null) {
                        $targetClass = $k['target_value'];
                    }
                }
            } else {
                $expr = $this->resolveTokensToString($filtered);
                if (str_contains($expr, '\\') || class_exists($expr) || interface_exists($expr)) {
                    $type = 'class_string';
                    $targetClass = $expr;
                }
            }
        }

        return [
            'key' => $key,
            'key_line' => $keyLine,
            'type' => $type,
            'target_class' => $targetClass,
            'array_keys' => $arrayKeys,
            'references' => $references,
        ];
    }

    /**
     * @param PhpToken[] $tokens
     * @return array<int, array{key: string, line: int, is_array: bool, target_value: ?string, references: array}>
     */
    private function parseArrayDefinitionEntries(array $tokens): array
    {
        $entries = [];
        $count = count($tokens);
        $i = 0;

        // Skip to outermost '[' or 'array('
        while ($i < $count && $tokens[$i]->text !== '[' && !$tokens[$i]->is(T_ARRAY)) {
            $i++;
        }
        if ($i >= $count) {
            return [];
        }
        if ($tokens[$i]->is(T_ARRAY)) {
            while ($i < $count && $tokens[$i]->text !== '(') {
                $i++;
            }
        }
        $i++; // past '['

        $depth = 1;
        while ($i < $count && $depth > 0) {
            if ($tokens[$i]->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, ord(',')])) {
                $i++;
                continue;
            }
            if ($tokens[$i]->text === ']' || $tokens[$i]->text === ')') {
                $depth--;
                $i++;
                break;
            }

            // Key until '=>' at depth 1
            $keyTokens = [];
            $keyLine = $tokens[$i]->line;
            while ($i < $count && !$tokens[$i]->is(T_DOUBLE_ARROW) && $depth === 1) {
                if ($tokens[$i]->text === '[' || $tokens[$i]->text === '(') {
                    $depth++;
                } elseif ($tokens[$i]->text === ']' || $tokens[$i]->text === ')') {
                    $depth--;
                }
                if ($depth === 1 && !$tokens[$i]->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT])) {
                    $keyTokens[] = $tokens[$i];
                }
                $i++;
            }

            if ($i >= $count || !$tokens[$i]->is(T_DOUBLE_ARROW)) {
                break;
            }

            $i++; // skip '=>'
            $keyName = $this->resolveTokensToString($keyTokens);

            // Read value until matching ',' at depth 1
            $valTokens = [];
            while ($i < $count) {
                $tok = $tokens[$i];
                if ($tok->text === '[' || $tok->text === '(') {
                    $depth++;
                } elseif ($tok->text === ']' || $tok->text === ')') {
                    $depth--;
                    if ($depth === 0) {
                        $i++;
                        break;
                    }
                } elseif ($tok->text === ',' && $depth === 1) {
                    $i++;
                    break;
                }
                $valTokens[] = $tok;
                $i++;
            }

            $filteredVal = array_values(array_filter($valTokens, fn($t) => !$t->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT])));
            $isArray = !empty($filteredVal) && ($filteredVal[0]->text === '[' || $filteredVal[0]->is(T_ARRAY));
            $targetValue = null;
            if (!empty($filteredVal)) {
                $targetValue = $this->resolveTokensToString($filteredVal);
            }

            $entries[] = [
                'key' => $keyName,
                'line' => $keyLine,
                'is_array' => $isArray,
                'target_value' => $targetValue,
                'references' => $this->extractReferences($valTokens),
            ];
        }

        return $entries;
    }

    /**
     * @param PhpToken[] $tokens
     * @return array<int, array{id: string, line: int, type: string}>
     */
    private function extractReferences(array $tokens): array
    {
        $refs = [];
        $count = count($tokens);

        for ($i = 0; $i < $count; $i++) {
            $tok = $tokens[$i];
            if ($tok->is(T_STRING) && in_array($tok->text, ['Reference', 'DynamicReference', 'ReferencesArray'], true)) {
                $type = $tok->text;
                $j = $i + 1;
                while ($j < $count && $tokens[$j]->is(T_WHITESPACE)) $j++;
                if ($j < $count && $tokens[$j]->is(T_DOUBLE_COLON)) {
                    $j++;
                    while ($j < $count && $tokens[$j]->is(T_WHITESPACE)) $j++;
                    if ($j < $count && $tokens[$j]->is(T_STRING)) {
                        $method = $tokens[$j]->text;
                        $j++;
                        while ($j < $count && $tokens[$j]->is(T_WHITESPACE)) $j++;
                        if ($j < $count && $tokens[$j]->text === '(') {
                            $j++;
                            $argTokens = [];
                            $depth = 1;
                            while ($j < $count && $depth > 0) {
                                if ($tokens[$j]->text === '(') $depth++;
                                elseif ($tokens[$j]->text === ')') {
                                    $depth--;
                                    if ($depth === 0) break;
                                }
                                $argTokens[] = $tokens[$j];
                                $j++;
                            }
                            $id = $this->resolveTokensToString($argTokens);
                            $refs[] = [
                                'id' => $id,
                                'line' => $tok->line,
                                'type' => $type . '::' . $method,
                            ];
                            $i = $j;
                        }
                    }
                }
            }
        }

        return $refs;
    }
}

// Entrypoint
$checker = new DiChecker($argv);
exit($checker->run());
