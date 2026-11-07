<?php

declare(strict_types=1);

namespace App\Web\Subscribe;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\FormModel\FormHydrator;

final readonly class SubscribeAction
{
    public function __construct(private FormHydrator $forms, private SubscriptionService $subscriptions, private DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new SubscribeForm();
        if (!$this->forms->populateFromPostAndValidate($form, $request)) {
            return $this->responses->createResponse(['error' => 'validation failed'], 422);
        }
        $this->subscriptions->subscribe($form->email);
        return $this->responses->createResponse(['status' => 'subscribed']);
    }
}
