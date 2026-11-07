<?php

declare(strict_types=1);

use App\Web\Billing\ExportInvoiceAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/invoices/{id}/export', action: ExportInvoiceAction::class),
];
