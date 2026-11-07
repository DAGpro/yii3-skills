<?php

declare(strict_types=1);

use App\Web\Auth\OAuthSuccessHandler;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\View\WebView;
use Yiisoft\Yii\AuthClient\AuthAction;
use Yiisoft\Yii\AuthClient\AuthClientInterface;
use Yiisoft\Yii\AuthClient\Collection;

/** @var array $params */

return [
    AuthAction::class => static function (
        Collection $clientCollection,
        Aliases $aliases,
        WebView $view,
        ResponseFactoryInterface $responseFactory,
        CurrentRoute $currentRoute,
        OAuthSuccessHandler $successHandler,
    ): AuthAction {
        return (new AuthAction($clientCollection, $aliases, $view, $responseFactory, $currentRoute))
            ->withSuccessUrl('/dashboard')
            ->withCancelUrl('/login')
            ->withSuccessCallback(
                static function (AuthClientInterface $client) use ($successHandler): ?ResponseInterface {
                    $successHandler->handle($client);

                    // null: fall back to the configured success URL
                    return null;
                }
            );
    },
];
