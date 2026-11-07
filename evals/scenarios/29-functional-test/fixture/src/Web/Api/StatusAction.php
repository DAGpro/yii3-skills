<?php

declare(strict_types=1);

namespace App\Web\Api;

use App\Api\StatusService;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class StatusAction
{
    public function __construct(
        private StatusService $status,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse($this->status->get());
    }
}
