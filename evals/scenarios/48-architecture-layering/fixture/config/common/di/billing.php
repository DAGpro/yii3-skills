<?php

declare(strict_types=1);

use App\Domain\Billing\InvoiceRepositoryInterface;
use App\Infrastructure\Persistence\DbInvoiceRepository;

return [
    InvoiceRepositoryInterface::class => DbInvoiceRepository::class,
];
