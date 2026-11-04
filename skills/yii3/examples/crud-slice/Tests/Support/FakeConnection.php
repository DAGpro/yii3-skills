<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Closure;
use LogicException;
use RuntimeException;
use Yiisoft\Db\Command\CommandInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Connection\ServerInfoInterface;
use Yiisoft\Db\Expression\ExpressionInterface;
use Yiisoft\Db\Query\BatchQueryResultInterface;
use Yiisoft\Db\Query\QueryInterface;
use Yiisoft\Db\QueryBuilder\QueryBuilderInterface;
use Yiisoft\Db\Schema\Column\ColumnFactoryInterface;
use Yiisoft\Db\Schema\QuoterInterface;
use Yiisoft\Db\Schema\SchemaInterface;
use Yiisoft\Db\Schema\TableSchemaInterface;
use Yiisoft\Db\Transaction\TransactionInterface;

/**
 * Minimal in-memory test double for `ConnectionInterface`.
 *
 * Simulates only the `transaction()` contract used by the use case handler:
 * the closure runs, the "commit" marker is recorded, and the result is
 * returned — or, when configured to fail, a `RuntimeException` is thrown
 * (the same roll-back-and-rethrow behavior as a real connection).
 * Every other method is a hard failure: the handler must not use them.
 *
 * In a real project prefer an ephemeral SQLite connection
 * (`yiisoft/db-sqlite`, see the Database Testing guide) or a mocking
 * library; this hand-rolled double keeps the example dependency-free.
 */
final class FakeConnection implements ConnectionInterface
{
    /** @var list<string> */
    private array $timeline = [];
    private bool $failTransaction = false;

    public function failNextTransaction(): void
    {
        $this->failTransaction = true;
    }

    /**
     * @return list<string>
     */
    public function getTimeline(): array
    {
        return $this->timeline;
    }

    public function transaction(Closure $closure, ?string $isolationLevel = null): mixed
    {
        if ($this->failTransaction) {
            // Real connections roll back and re-throw without calling the closure
            // when the transaction cannot be started; a failure inside the closure
            // (e.g. the repository throwing) also aborts with a rollback.
            throw new RuntimeException('Simulated transaction failure (rollback).');
        }

        $this->timeline[] = 'transaction.begin';
        try {
            $result = $closure();
        } catch (\Throwable $e) {
            $this->timeline[] = 'transaction.rollback';
            throw $e;
        }
        $this->timeline[] = 'transaction.commit';
        return $result;
    }

    public function getLastInsertId(?string $sequenceName = null): string
    {
        // Deterministic auto-increment substitute for the INSERT performed by the repository.
        return '42';
    }

    public function beginTransaction(?string $isolationLevel = null): TransactionInterface
    {
        throw $this->unused('beginTransaction');
    }

    public function createBatchQueryResult(QueryInterface $query): BatchQueryResultInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function createCommand(?string $sql = null, array $params = []): CommandInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function createQuery(): QueryInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function createTransaction(): TransactionInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function close(): void
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getColumnBuilderClass(): string
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getColumnFactory(): ColumnFactoryInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getDriverName(): string
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getQueryBuilder(): QueryBuilderInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getQuoter(): QuoterInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getSchema(): SchemaInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getServerInfo(): ServerInfoInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getTablePrefix(): string
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getTableSchema(string $name, bool $refresh = false): ?TableSchemaInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function getTransaction(): ?TransactionInterface
    {
        throw $this->unused(__FUNCTION__);
    }

    public function isActive(): bool
    {
        throw $this->unused(__FUNCTION__);
    }

    public function isSavepointEnabled(): bool
    {
        throw $this->unused(__FUNCTION__);
    }

    public function open(): void
    {
        throw $this->unused(__FUNCTION__);
    }

    public function quoteValue(mixed $value): mixed
    {
        throw $this->unused(__FUNCTION__);
    }

    public function setEnableSavepoint(bool $value): void
    {
        throw $this->unused(__FUNCTION__);
    }

    public function select(
        array|bool|float|int|string|ExpressionInterface $columns = [],
        ?string $option = null,
    ): QueryInterface {
        throw $this->unused(__FUNCTION__);
    }

    public function setTablePrefix(string $value): void
    {
        throw $this->unused(__FUNCTION__);
    }

    private function unused(string $method): LogicException
    {
        return new LogicException("FakeConnection::{$method}() must not be called by the code under test.");
    }
}
