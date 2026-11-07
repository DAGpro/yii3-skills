<?php

declare(strict_types=1);

namespace App\Web\Billing;

use App\Domain\Billing\InvoiceService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class CreateInvoiceAction
{
    public function __construct(
        private InvoiceService $invoices,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $invoice = $this->invoices->draftFromRequest($request);
        $chargeId = $this->invoices->collect($invoice);

        return $this->responses->createResponse(
            [
                'invoice' => ['customer' => $invoice->customer, 'amount_cents' => $invoice->amountCents],
                'charge_id' => $chargeId,
            ],
            Status::CREATED,
        );
    }
}
