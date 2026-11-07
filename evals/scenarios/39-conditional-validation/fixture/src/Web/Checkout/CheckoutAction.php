<?php

declare(strict_types=1);

namespace App\Web\Checkout;

use App\Shop\CheckoutService;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Status;

final readonly class CheckoutAction
{
    public function __construct(
        private CheckoutService $checkout,
        private FormHydrator $formHydrator,
        private ResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new CheckoutForm();
        if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
            $this->checkout->place($form->name, $form->address, $form->couponCode);
            return $this->responses->createResponse(Status::OK);
        }

        return $this->responses->createResponse(Status::UNPROCESSABLE_ENTITY);
    }
}
