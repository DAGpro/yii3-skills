<?php

declare(strict_types=1);

namespace App\Web\Blog;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

final readonly class RegisterAction
{
    public function __construct(
        private MailerInterface $mailer,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody() ?? [];
        $email = trim((string) ($body['email'] ?? ''));
        $name = trim((string) ($body['name'] ?? ''));

        // Registration itself is done (persistence omitted in the fixture).

        // Slow: the SMTP roundtrip blocks the request until the transport answers.
        $welcome = new Message(
            to: $email,
            subject: 'Welcome to the blog',
            textBody: sprintf('Hi %s, welcome aboard!', $name),
        );
        $this->mailer->send($welcome);

        return $this->responses->createResponse(['status' => 'registered']);
    }
}
