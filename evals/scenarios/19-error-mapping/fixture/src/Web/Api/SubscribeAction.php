<?php

declare(strict_types=1);

namespace App\Web\Api;

use App\Blog\Application\SubscribeService;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class SubscribeAction
{
    public function __construct(
        private SubscribeService $subscribe,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $this->subscribe->subscribe((string) $route->getArgument('email'));

        return $this->responses->createResponse(['status' => 'subscribed'], Status::CREATED);
    }
}
