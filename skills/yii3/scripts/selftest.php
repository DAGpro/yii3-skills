<?php

declare(strict_types=1);

/**
 * Deterministic Verifier Self-Test Runner.
 *
 * Verifies the Yii3 static verifiers themselves against the fixtures in
 * scripts/fixtures/: every positive fixture must pass (exit 0, no errors),
 * every negative fixture must be reported with its expected rule codes.
 *
 * Usage (from the skill package directory): php scripts/selftest.php
 *
 * Exit Codes:
 *   0: all fixture expectations hold.
 *   1: at least one expectation failed (verifier regression).
 *   2: fatal invocation error (unsupported PHP version, missing fixtures).
 */

if (PHP_VERSION_ID < 80100) {
    fwrite(STDERR, "[FATAL] selftest requires PHP 8.1 or higher (current: " . PHP_VERSION . ").\n");
    exit(2);
}

final class VerifierSelfTest
{
    private const FIXTURES_DIR = __DIR__ . '/fixtures';

    /**
     * Case name -> [verifier script, target path relative to fixtures dir, expected rule codes, expected blocking].
     * 'expected blocking' = the run must exit 1 (true) or exit 0 (false).
     */
    private const CASES = [
        // --- routes ---
        'routes/positive' => ['verify-routes.php', 'routes/positive', [], false],
        'routes/negative-static-factory' => ['verify-routes.php', 'routes/negative-static-factory', ['legacy_static_route_factory'], true],
        'routes/negative-legacy-param' => ['verify-routes.php', 'routes/negative-legacy-param', ['legacy_route_param_syntax'], true],
        'routes/negative-duplicate-name' => ['verify-routes.php', 'routes/negative-duplicate-name', ['duplicate_route_name'], true],
        'routes/negative-string-target' => ['verify-routes.php', 'routes/negative-string-target', ['legacy_route_action_target'], true],
        // --- actions ---
        'actions/positive' => ['verify-actions.php', 'actions/positive', [], false],
        'actions/negative-output' => ['verify-actions.php', 'actions/negative-output', ['action_output_statement'], true],
        'actions/negative-return-array' => ['verify-actions.php', 'actions/negative-return-array', ['action_returns_non_response'], false],
        'actions/negative-sql' => ['verify-actions.php', 'actions/negative-sql', ['thin_action_create_command'], true],
        // --- DI ---
        'di/positive' => ['check-di-syntax.php', 'di/positive', [], false],
        'di/negative' => ['check-di-syntax.php', 'di/negative', ['typo_class_key'], true],
    ];

    private string $fixturesDir;
    private string $phpBinary;

    /** @var list<string> */
    private array $failures = [];

    public function __construct()
    {
        $this->fixturesDir = str_replace('\\', '/', self::FIXTURES_DIR);
        $this->phpBinary = PHP_BINARY !== '' ? PHP_BINARY : 'php';
    }

    public function run(): int
    {
        if (!is_dir($this->fixturesDir)) {
            fwrite(STDERR, "[FATAL] fixtures directory not found: {$this->fixturesDir}\n");
            return 2;
        }

        foreach (self::CASES as $name => [$script, $target, $expectedRules, $expectBlocking]) {
            $this->runCase($name, $script, $target, $expectedRules, $expectBlocking);
        }

        $total = count(self::CASES);
        $failed = count($this->failures);

        if ($failed > 0) {
            echo "SELFTEST: FAILED ({$failed} of {$total} cases)\n";
            foreach ($this->failures as $failure) {
                echo "  - {$failure}\n";
            }
            return 1;
        }

        echo "SELFTEST: PASSED ({$total} cases, all verifier expectations hold)\n";
        return 0;
    }

    /**
     * @param list<string> $expectedRules
     */
    private function runCase(string $name, string $script, string $target, array $expectedRules, bool $expectBlocking): void
    {
        $scriptPath = str_replace('\\', '/', __DIR__) . '/' . $script;
        $targetPath = $this->fixturesDir . '/' . $target;

        if (!is_file($scriptPath) || !is_dir($targetPath)) {
            $this->failures[] = "{$name}: missing script ({$script}) or fixture target ({$target})";
            return;
        }

        $cmd = escapeshellarg($this->phpBinary) . ' ' . escapeshellarg($scriptPath)
            . ' ' . escapeshellarg($targetPath) . ' --format=json';
        $output = shell_exec($cmd);
        if (!is_string($output) || trim($output) === '') {
            $this->failures[] = "{$name}: verifier produced no output";
            return;
        }

        $decoded = json_decode($output, true);
        if (!is_array($decoded)) {
            $this->failures[] = "{$name}: verifier output is not valid JSON ({$script})";
            return;
        }

        // The three verifiers use different JSON shapes: verify-routes exposes flat
        // error_count; verify-actions and check-di-syntax expose exit_code + summary.errors_count.
        $errorCount = $decoded['error_count']
            ?? $decoded['summary']['errors_count']
            ?? null;
        $exitCode = isset($decoded['exit_code'])
            ? (int) $decoded['exit_code']
            : (($errorCount ?? 0) > 0 ? 1 : 0);
        $rules = [];
        foreach ($decoded['issues'] ?? [] as $issue) {
            if (isset($issue['rule'])) {
                $rules[$issue['rule']] = true;
            }
        }

        if ($expectBlocking && $exitCode !== 1) {
            $this->failures[] = "{$name}: expected blocking errors (exit 1), got exit {$exitCode}";
        }
        if (!$expectBlocking && $exitCode !== 0) {
            $this->failures[] = "{$name}: expected a clean pass (exit 0), got exit {$exitCode}";
        }

        foreach ($expectedRules as $rule) {
            if (!isset($rules[$rule])) {
                $this->failures[] = "{$name}: expected rule '{$rule}' was not reported";
            }
        }
    }
}

$selftest = new VerifierSelfTest();
exit($selftest->run());
