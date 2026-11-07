<?php

declare(strict_types=1);

namespace App\Web;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class DocsAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse(['docs' => 'See README.md']);
    }
}
