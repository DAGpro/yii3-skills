<?php

declare(strict_types=1);

namespace App\Web\Subscribe;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class SubscribeAction
{
    public function __construct(private SubscriptionService $subscriptions, private DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody() ?? [];
        // Same approach as ContactAction.
        $email = isset($body['email']) ? trim((string) $body['email']) : '';
        if ($email === '') {
            return $this->responses->createResponse(['error' => 'email is required'], 422);
        }
        $this->subscriptions->subscribe($email);
        return $this->responses->createResponse(['status' => 'subscribed']);
    }
}
