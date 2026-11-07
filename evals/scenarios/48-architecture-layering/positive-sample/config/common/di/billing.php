<?php

declare(strict_types=1);

use App\Domain\Billing\InvoiceRepositoryInterface;
use App\Domain\Billing\PaymentGatewayInterface;
use App\Infrastructure\Persistence\DbInvoiceRepository;
use App\Infrastructure\Payment\StripeGateway;

return [
    InvoiceRepositoryInterface::class => DbInvoiceRepository::class,
    PaymentGatewayInterface::class => StripeGateway::class,
];
