<?php

declare(strict_types=1);

namespace App\Presentation\Http\Order;

use App\Domain\Order\Order;
use App\Domain\Order\OrderRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Queue\Message\GenericMessage;
use Yiisoft\Queue\QueueProducerInterface;

final readonly class CreateOrderAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private ConnectionInterface $db,
        private OrderRepositoryInterface $orders,
        private QueueProducerInterface $queueProducer,
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

        $order = $this->db->transaction(function () use ($input): Order {
            $order = Order::create($input->orderId, $input->userId, $input->totalCents);
            $this->orders->save($order);
            $this->queueProducer->push(new GenericMessage('order.placed', ['orderId' => $order->id]));
            return $order;
        });

        return $this->responseFactory->createResponse(['orderId' => $order->id], Status::CREATED);
    }
}
