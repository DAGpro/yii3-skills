<?php

declare(strict_types=1);

use App\Billing\Domain\InvoiceRepositoryInterface;
use App\Billing\Infrastructure\DbInvoiceRepository;

return [
    InvoiceRepositoryInterface::class => DbInvoiceRepository::class,
];
