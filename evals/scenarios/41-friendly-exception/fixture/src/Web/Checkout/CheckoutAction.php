<?php

declare(strict_types=1);

namespace App\Web\Checkout;

use App\Shop\Checkout\CheckoutService;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class CheckoutAction
{
    public function __construct(
        private CheckoutService $checkout,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $this->checkout->placeOrder((string) $route->getArgument('sku'), (int) $route->getArgument('userId'));

        return $this->responses->createResponse(['status' => 'order placed'], Status::CREATED);
    }
}
