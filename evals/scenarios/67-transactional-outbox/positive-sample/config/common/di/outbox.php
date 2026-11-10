<?php

declare(strict_types=1);

use App\Domain\Outbox\OutboxWriterInterface;
use App\Infrastructure\Outbox\DbOutboxWriter;

return [
    OutboxWriterInterface::class => DbOutboxWriter::class,
];
