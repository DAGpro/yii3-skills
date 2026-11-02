<?php

declare(strict_types=1);

/**
 * Yii 3 Unified Deterministic Verification Runner.
 *
 * Runs all deterministic static verifiers (DI, Actions, Routes) in a single pass.
 * Returns aggregated output and unified exit code.
 *
 * Verifiers orchestrated:
 * 1. check-di-syntax.php   (DI configuration syntax, invalid keys, unmapped interfaces, params.php)
 * 2. verify-actions.php    (declare strict_types, ResponseInterface, Thin Action SQL/DB ban, legacy traps)
 * 3. verify-routes.php     (FastRoute syntax, duplicate route names, string action targets, Yii 2 facades)
 *
 * Exit Codes:
 *   0: All verifiers passed (clean or warnings only).
 *   1: At least one verifier reported blocking errors.
 *   2: Fatal invocation error (invalid path, unreadable file, unsupported PHP version).
 */

if (PHP_VERSION_ID < 80100) {
    fwrite(STDERR, "[FATAL] verify-all requires PHP 8.1 or higher (current: " . PHP_VERSION . ").\n");
    exit(2);
}

final class UnifiedVerificationRunner
{
    private string $scriptsDir;
    private string $targetPath;
    private string $format = 'text'; // 'text' | 'json'
    private bool $quiet = false;
    private bool $verbose = false;
    private array $rawArgs = [];

    /** @var array<string, array{exit_code: int, stdout: string, stderr: string}> */
    private array $results = [];

    public function __construct(array $argv)
    {
        $this->scriptsDir = str_replace('\\', '/', __DIR__);
        $this->parseArguments($argv);
    }

    public function run(): int
    {
        $checkers = [
            'di' => [
                'name' => 'check-di-syntax.php',
                'description' => 'DI Container & Config Checker',
            ],
            'actions' => [
                'name' => 'verify-actions.php',
                'description' => 'Action & Controller Auditor',
            ],
            'routes' => [
                'name' => 'verify-routes.php',
                'description' => 'Route Configuration Verifier',
            ],
        ];

        $phpBinary = PHP_BINARY !== '' ? PHP_BINARY : 'php';
        $maxExitCode = 0;

        foreach ($checkers as $key => $info) {
            $scriptPath = $this->scriptsDir . '/' . $info['name'];
            if (!is_file($scriptPath)) {
                fwrite(STDERR, "[FATAL] Checker script not found: {$scriptPath}\n");
                return 2;
            }

            $cmd = escapeshellarg($phpBinary) . ' ' . escapeshellarg($scriptPath);

            // Forward arguments
            if ($this->targetPath !== '') {
                $cmd .= ' ' . escapeshellarg($this->targetPath);
            }
            if ($this->format === 'json') {
                $cmd .= ' --format=json';
            }
            if ($this->quiet) {
                $cmd .= ' --quiet';
            }
            if ($this->verbose) {
                $cmd .= ' --verbose';
            }

            $descriptorSpec = [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ];

            $process = proc_open($cmd, $descriptorSpec, $pipes);
            if (!is_resource($process)) {
                fwrite(STDERR, "[FATAL] Failed to execute process: {$cmd}\n");
                return 2;
            }

            fclose($pipes[0]);
            $stdout = stream_get_contents($pipes[1]) ?: '';
            fclose($pipes[1]);
            $stderr = stream_get_contents($pipes[2]) ?: '';
            fclose($pipes[2]);

            $exitCode = proc_close($process);

            $this->results[$key] = [
                'name' => $info['name'],
                'description' => $info['description'],
                'exit_code' => $exitCode,
                'stdout' => trim($stdout),
                'stderr' => trim($stderr),
            ];

            if ($exitCode > $maxExitCode) {
                $maxExitCode = $exitCode;
            }
        }

        $this->renderReport();
        return $maxExitCode >= 2 ? 2 : ($maxExitCode === 1 ? 1 : 0);
    }

    private function parseArguments(array $argv): void
    {
        $this->targetPath = getcwd() ?: '.';

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
                $this->targetPath = substr($arg, 7);
                continue;
            }

            if (!str_starts_with($arg, '-')) {
                $this->targetPath = $arg;
            }
        }

        $this->targetPath = rtrim(str_replace('\\', '/', realpath($this->targetPath) ?: $this->targetPath), '/');
    }

    private function printHelp(): void
    {
        echo <<<HELP
Yii 3 Unified Deterministic Verification Suite.

Usage:
  php verify-all.php [project-path] [options]

Arguments:
  project-path          Target Yii 3 project root directory (default: current working directory).

Options:
  --format=text|json    Output format: human-readable summary (default) or aggregated JSON.
  --quiet, -q           Only display errors and warnings.
  --verbose, -v         Display detailed inspection output.
  --help, -h            Show this help message.

Checkers Executed:
  1. check-di-syntax.php  — Validates config/**/di/*.php, parameters, interface bindings
  2. verify-actions.php   — Validates strict_types, PSR-7 ResponseInterface, Thin Action rule
  3. verify-routes.php    — Validates FastRoute syntax, route names, and action handlers

Exit Codes:
  0 = All checks passed (clean or warnings only)
  1 = Validation errors found (blocking)
  2 = Fatal invocation error

HELP;
    }

    private function renderReport(): void
    {
        if ($this->format === 'json') {
            $aggregated = [
                'status' => 'pass',
                'target_path' => $this->targetPath,
                'checkers' => [],
                'all_issues' => [],
                'total_errors' => 0,
                'total_warnings' => 0,
            ];

            $hasFatal = false;
            $hasError = false;

            foreach ($this->results as $key => $res) {
                $parsedJson = null;
                if ($res['stdout'] !== '' && ($res['stdout'][0] === '{' || $res['stdout'][0] === '[')) {
                    $parsedJson = json_decode($res['stdout'], true);
                }

                $issues = $parsedJson['issues'] ?? [];
                $errCount = $parsedJson['error_count'] ?? ($res['exit_code'] === 1 ? 1 : 0);
                $warnCount = $parsedJson['warning_count'] ?? 0;

                $aggregated['total_errors'] += $errCount;
                $aggregated['total_warnings'] += $warnCount;

                if ($res['exit_code'] === 2) {
                    $hasFatal = true;
                } elseif ($res['exit_code'] === 1 || $errCount > 0) {
                    $hasError = true;
                }

                $aggregated['checkers'][$key] = [
                    'script' => $res['name'],
                    'exit_code' => $res['exit_code'],
                    'error_count' => $errCount,
                    'warning_count' => $warnCount,
                    'raw_output' => $parsedJson === null ? $res['stdout'] : null,
                    'stderr' => $res['stderr'] !== '' ? $res['stderr'] : null,
                ];

                foreach ($issues as $iss) {
                    $iss['checker'] = $res['name'];
                    $aggregated['all_issues'][] = $iss;
                }
            }

            if ($hasFatal) {
                $aggregated['status'] = 'fatal';
            } elseif ($hasError) {
                $aggregated['status'] = 'fail';
            }

            echo json_encode($aggregated, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            return;
        }

        // Text format
        echo "===================================================================\n";
        echo " Yii 3 Deterministic Verification Suite\n";
        echo " Target: {$this->targetPath}\n";
        echo "===================================================================\n";

        $hasErrors = false;
        $hasFatal = false;

        foreach ($this->results as $res) {
            $code = $res['exit_code'];
            $tag = $code === 0 ? '[PASS]' : ($code === 1 ? '[FAIL]' : '[FATAL]');
            echo "{$tag} {$res['name']} ({$res['description']})\n";

            if ($code !== 0 && $res['stdout'] !== '') {
                $lines = explode("\n", $res['stdout']);
                foreach ($lines as $line) {
                    echo "    " . rtrim($line) . "\n";
                }
            }

            if ($res['stderr'] !== '') {
                echo "    STDERR: {$res['stderr']}\n";
            }

            if ($code === 1) {
                $hasErrors = true;
            } elseif ($code === 2) {
                $hasFatal = true;
            }
        }

        echo "-------------------------------------------------------------------\n";
        if ($hasFatal) {
            echo "RESULT: FATAL ERROR (one or more checkers failed to execute, exit 2)\n";
        } elseif ($hasErrors) {
            echo "RESULT: FAILED (blocking errors reported, exit 1)\n";
        } else {
            echo "RESULT: PASSED (all deterministic verifiers passed, exit 0)\n";
        }
        echo "===================================================================\n";
    }
}

$runner = new UnifiedVerificationRunner($argv);
exit($runner->run());

