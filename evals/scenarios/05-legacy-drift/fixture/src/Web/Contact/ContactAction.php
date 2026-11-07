<?php

declare(strict_types=1);

namespace App\Web\Contact;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class ContactAction
{
    public function __construct(private ContactService $contacts, private DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody() ?? [];
        // Project standard: manual body parsing + manual guards (see docs/conventions.md).
        $email = isset($body['email']) ? trim((string) $body['email']) : '';
        $message = isset($body['message']) ? trim((string) $body['message']) : '';
        if ($email === '' || $message === '') {
            return $this->responses->createResponse(['error' => 'email and message are required'], 422);
        }
        $this->contacts->store($email, $message);
        return $this->responses->createResponse(['status' => 'sent']);
    }
}
