<?php

declare(strict_types=1);

namespace App\Web\Docs;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Yiisoft\Http\Status;

final readonly class DocsAction
{
    public function __construct(
        private ResponseFactoryInterface $responses,
        private StreamFactoryInterface $streams,
    ) {}

    public function __invoke(): ResponseInterface
    {
        $spec = dirname(__DIR__, 3) . '/docs/openapi.json';

        return $this->responses
            ->createResponse(Status::OK)
            ->withHeader('Content-Type', 'application/json')
            ->withBody($this->streams->createStream((string) file_get_contents($spec)));
    }
}
