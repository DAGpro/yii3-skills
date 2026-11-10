<?php

declare(strict_types=1);

namespace App\Presentation\Http\Order;

use App\Application\Order\UseCase\PlaceOrderCommand;
use App\Application\Order\UseCase\PlaceOrderUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;

final readonly class CreateOrderAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private PlaceOrderUseCase $useCase,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        /** @var CreateOrderInput $input */
        $input = $this->hydrator->create(CreateOrderInput::class, (array) $request->getParsedBody());
        if (!$input->getValidationResult()->isValid()) {
            return $this->responseFactory->createResponse(
                ['errors' => $input->getValidationResult()->getErrorMessagesIndexedByPath()],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        $order = $this->useCase->execute(new PlaceOrderCommand(
            orderId: $input->orderId,
            userId: $input->userId,
            totalCents: $input->totalCents,
        ));

        return $this->responseFactory->createResponse(['orderId' => $order->id], Status::CREATED);
    }
}
