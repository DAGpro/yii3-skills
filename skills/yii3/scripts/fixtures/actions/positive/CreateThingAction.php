<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Application\CreateThingHandler;
use App\Domain\ThingStatus;
use DomainException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Validator\ValidatorInterface;

final readonly class CreateThingAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private ValidatorInterface $validator,
        private DataResponseFactoryInterface $responseFactory,
        private CreateThingHandler $handler,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        /** @var array<string, mixed> $data */
        $data = (array) ($request->getParsedBody() ?? []);

        $result = $this->validator->validate($this->hydrator->create(CreateThingDto::class, $data));
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(
                ['status' => 'error', 'errors' => $result->getErrorMessagesIndexedByPath()],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        try {
            $thing = $this->handler->handle(new CreateThingCommand(
                title: $data['title'],
                status: ThingStatus::from((string) ($data['status'] ?? 'draft')),
            ));
        } catch (DomainException $e) {
            return $this->responseFactory->createResponse(['status' => 'error', 'message' => $e->getMessage()], Status::CONFLICT);
        }

        return $this->responseFactory->createResponse(['status' => 'success', 'data' => $thing->toArray()], Status::CREATED);
    }
}
