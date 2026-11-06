<?php

declare(strict_types=1);

namespace App\Web\Api;

use App\Blog\Application\SubscribeService;
use App\Domain\Subscription\EmailAlreadySubscribedException;
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
        try {
            $this->subscribe->subscribe((string) $route->getArgument('email'));
            return $this->responses->createResponse(['status' => 'subscribed'], Status::CREATED);
        } catch (EmailAlreadySubscribedException $e) {
            // Inline handling instead of the ExceptionResponder mapping: the client
            // error is reported as a 500 with the raw message and no content type.
            return $this->responses->createResponse(['error' => $e->getMessage()], 500);
        }
    }
}
