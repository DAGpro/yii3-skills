<?php

declare(strict_types=1);

namespace App\Newsletter\Presentation;

use App\Newsletter\Application\SubscribeCommand;
use App\Newsletter\Application\SubscribeHandler;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Validator\ValidatorInterface;

final readonly class SubscribeAction
{
    public function __construct(
        private SubscribeHandler $handler,
        private ValidatorInterface $validator,
        private DataResponseFactoryInterface $responseFactory,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array)($request->getParsedBody() ?? []);
        $dto = new SubscribeRequest();
        $dto->email = (string)($body['email'] ?? '');

        $result = $this->validator->validate($dto);
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(
                ['errors' => $result->getErrorMessagesIndexedByProperty()],
                Status::UNPROCESSABLE_ENTITY
            );
        }

        $this->handler->handle(new SubscribeCommand($dto->email));

        return $this->responseFactory->createResponse(
            ['status' => 'subscribed', 'email' => $dto->email],
            Status::CREATED
        );
    }
}

