<?php

declare(strict_types=1);

namespace App\Web;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class AboutAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse(['name' => 'Acme', 'edition' => 'community']);
    }
}
