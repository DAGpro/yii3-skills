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
        // Presentation concern: read the request body here, pass plain values into the domain.
        $body = $request->getParsedBody();
        $invoice = $this->invoices->draft(
            (string) ($body['customer'] ?? ''),
            (int) ($body['amount_cents'] ?? 0),
        );
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
