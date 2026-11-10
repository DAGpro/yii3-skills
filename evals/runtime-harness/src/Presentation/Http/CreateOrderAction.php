<?php

declare(strict_types=1);

namespace App\Presentation\Http;

use App\Application\Order\CreateOrderInput;
use App\Application\Order\PlaceOrderCommand;
use App\Application\Order\PlaceOrderUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;

final class CreateOrderAction
{
    public function __construct(
        private readonly HydratorInterface $hydrator,
        private readonly PlaceOrderUseCase $placeOrderUseCase,
        private readonly DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $parsedBody = $request->getParsedBody();
        /** @var array<string, mixed> $data */
        $data = is_array($parsedBody) ? $parsedBody : [];

        /** @var CreateOrderInput $input */
        $input = $this->hydrator->create(CreateOrderInput::class, $data);
        $validation = $input->getValidationResult();
        if (!$validation->isValid()) {
            return $this->responseFactory->createResponse(
                [
                    'errors' => $validation->getErrorMessagesIndexedByPath(),
                ],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        $result = $this->placeOrderUseCase->execute(
            new PlaceOrderCommand(
                customerEmail: $input->customerEmail,
                amountCents: $input->amountCents,
            ),
        );

        return $this->responseFactory->createResponse(
            [
                'orderId' => $result->order->id,
                'customerEmail' => $result->order->customerEmail,
                'amountCents' => $result->order->amountCents,
                'status' => $result->order->status,
                'outboxMessageId' => $result->outboxMessageId,
            ],
            Status::CREATED,
        );
    }
}
