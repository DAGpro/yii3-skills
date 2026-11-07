<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Application\Queue\SendWelcomeEmailMessage;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Queue\QueueProducerInterface;

final readonly class RegisterAction
{
    public function __construct(
        private QueueProducerInterface $producer,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody() ?? [];
        $email = trim((string) ($body['email'] ?? ''));
        $name = trim((string) ($body['name'] ?? ''));

        // Registration itself is done (persistence omitted in the fixture).

        // Returns immediately; the queue worker performs the SMTP roundtrip.
        $this->producer->push(new SendWelcomeEmailMessage(email: $email, name: $name));

        return $this->responses->createResponse(['status' => 'registered']);
    }
}
