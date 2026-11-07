<?php

declare(strict_types=1);

use App\Web\Billing\CreateInvoiceAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/invoices', action: CreateInvoiceAction::class),
];
