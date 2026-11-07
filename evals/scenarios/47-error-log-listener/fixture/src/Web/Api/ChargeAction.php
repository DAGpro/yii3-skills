<?php

declare(strict_types=1);

namespace App\Web\Api;

use App\Billing\Application\ChargeInvoice;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class ChargeAction
{
    public function __construct(
        private ChargeInvoice $charges,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $this->charges->charge((string) $route->getArgument('invoiceId'));

        $response = $this->responseFactory
            ->createResponse(Status::CREATED)
            ->withHeader(Header::CONTENT_TYPE, 'application/json');
        $response->getBody()->write('{"status":"charged"}');

        return $response;
    }
}
