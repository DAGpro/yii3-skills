<?php

declare(strict_types=1);

namespace App\Order;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\DataResponseFactoryInterface;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Validator\ValidatorInterface;

final class CancelOrderAction
{
    public function __construct(
        private OrderRepositoryInterface $repository,
        private DataResponseFactoryInterface $responseFactory,
        private HydratorInterface $hydrator,
        private ValidatorInterface $validator,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = (string) ($request->getAttribute('id') ?? '');
        $data = (array) ($request->getParsedBody() ?? []);

        /** @var CancelOrderDto $dto */
        $dto = $this->hydrator->create(CancelOrderDto::class, $data);
        $result = $this->validator->validate($dto);
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(['errors' => $result->getErrorMessagesIndexedByPath()], 422);
        }

        $this->repository->cancel($id, $dto->reason);

        return $this->responseFactory->createResponse(['status' => 'cancelled', 'id' => $id]);
    }
}
