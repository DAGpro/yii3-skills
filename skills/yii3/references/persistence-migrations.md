# Yii3 Database Migrations Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical patterns for schema DDL, foreign keys, indexes, data seeding, multi-database management, and reversible migrations using `yiisoft/db-migration` and `yiisoft/db`.

This topic is split into two focused guides — load the one that matches the task:

- [Schema Construction & Data Seeding](persistence-migrations-schema.md) — migration architecture & interface contracts, class/file naming, modern `ColumnBuilder` schema construction, foreign keys & cross-DBMS portability, DDL alterations, data migrations & streaming seeds (§1–§6).
- [Configuration & Console Commands](persistence-migrations-operations.md) — `config/params.php` for the migration tool, the full console command catalog, namespaces, multi-database targets, CI/Docker automation (§7–§8).

Related guides: [Database Persistence](persistence-db.md), [Active Record](persistence-active-record.md), [Cycle ORM](persistence-cycle-orm.md), [Console Commands](infra-commands.md), [i18n & Translation](http-i18n-translation.md) (translation schema).
