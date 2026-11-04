# Yii3 Testing: Mutation Testing with Infection (`infection/infection`)

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

> Complete reference for Infection mutation testing in Yii3 projects: role and architecture, installation, canonical `infection.json.dist` configuration, the Testo runner bridge (`testo/bridge-infection`), and execution with MSI thresholds.

**Scope & Ownership.** This guide is the single source of truth for Infection mutation testing. Infection operates as an **optional quality-gate layer on top of the chosen test runner** (`phpunit/phpunit` or `testo/testo`) — it is not an alternative runner and does not affect the exclusive runner rule. Runner selection (PHPUnit XOR Testo) is owned by the [Testing Core Guide, §2](testing-core.md#2-test-runner-ecosystem--quality-gates) and the [Testo Runner Guide](testing-testo.md); Codeception by the [Codeception Testing Guide](testing-codeception.md).

---

## Table of Contents
- [1. Mutation Testing via Infection (`infection/infection`)](#1-mutation-testing-via-infection-infectioninfection)
  - [1.1. Role & Architecture](#11-role--architecture)
  - [1.2. Installation](#12-installation)
  - [1.3. Configuration (`infection.json.dist`)](#13-configuration-infectionjsondist)
  - [1.4. Testo Runner Bridge (`testo/bridge-infection`)](#14-testo-runner-bridge-testobridge-infection)
  - [1.5. Execution](#15-execution)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Mutation Testing via Infection (`infection/infection`)

Mutation testing operates as an **orthogonal quality gate** on top of the test runner. It systematically introduces subtle semantic mutations (flipped conditions, mutated return values, altered arithmetic) into source code to verify that test suites fail when bugs are introduced.

### 1.1. Role & Architecture
- **Does NOT replace the runner:** Operates above `phpunit/phpunit` or `testo/testo`.
- **Metrics:** Calculates Mutation Score Indicator (MSI) and Covered Code MSI.
- **Optimization:** Pairing Infection with `roave/infection-static-analysis-plugin` leverages static analysis (Psalm/PHPStan) to eliminate type-impossible mutants upfront, speeding up execution.

### 1.2. Installation
```bash
composer require --dev infection/infection roave/infection-static-analysis-plugin
```

Enable `infection/extension-installer` in `composer.json`:
```json
"config": {
    "allow-plugins": {
        "infection/extension-installer": true
    }
}
```

### 1.3. Configuration (`infection.json.dist`)
Canonical configuration grounded in official `yiisoft/*` packages:

```json
{
    "source": {
        "directories": [
            "src"
        ]
    },
    "logs": {
        "text": "php://stderr",
        "stryker": {
            "report": "master"
        }
    },
    "mutators": {
        "@default": true,
        "global-ignoreSourceCodeByRegex": [
            ".*bool \\$useCache = true.*"
        ],
        "LogicalAndSingleSubExprNegation": {
            "ignoreSourceCodeByRegex": [
                ".*if \\(\\$enableIdn .*"
            ]
        }
    }
}
```

### 1.4. Testo Runner Bridge (`testo/bridge-infection`)
While Infection natively supports PHPUnit, projects using the `testo/testo` runner require the official bridge package:
```bash
composer require --dev testo/bridge-infection
```

### 1.5. Execution
```bash
# Direct execution:
vendor/bin/infection --threads=max --min-msi=80 --min-covered-msi=90

# With static analysis plugin:
vendor/bin/roave-infection-static-analysis-plugin --threads=max
```

---

## Related Topic Guides
- [Testing Core Guide](testing-core.md) — Test architecture, exclusive runner rule (§2), PSR test doubles, mocking rules, and named-arguments reference.
- [Testo Runner Guide](testing-testo.md) — Alternative lightweight runner; `testo/bridge-infection` wires Infection to the Testo path.
- [Codeception Testing Guide](testing-codeception.md) — Alternative actor-driven test framework (mutually exclusive with plain PHPUnit/Testo suite setups).
