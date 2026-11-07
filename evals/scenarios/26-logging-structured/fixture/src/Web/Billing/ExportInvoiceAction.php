<?php

declare(strict_types=1);

namespace App\Web\Billing;

use App\Billing\Application\InvoiceExporter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\CurrentRoute;

final readonly class ExportInvoiceAction
{
    public function __construct(
        private InvoiceExporter $exporter,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request, CurrentRoute $route): ResponseInterface
    {
        $content = $this->exporter->export((int) $route->getArgument('id'));

        if ($content === null) {
            // Callers only learn that the export failed - nothing is recorded anywhere.
            return $this->responses->createResponse(['status' => 'export failed'], 500);
        }

        return $this->responses->createResponse(['status' => 'ok', 'content' => $content]);
    }
}
