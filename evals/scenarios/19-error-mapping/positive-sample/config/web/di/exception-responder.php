<?php

declare(strict_types=1);

use App\Domain\Subscription\EmailAlreadySubscribedException;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

use function json_encode;

use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;

return [
    ExceptionResponder::class => [
        'class' => ExceptionResponder::class,
        '__construct()' => [
            'exceptionMap' => [
                EmailAlreadySubscribedException::class => static function (
                    EmailAlreadySubscribedException $exception,
                    ResponseFactoryInterface $responseFactory,
                ): ResponseInterface {
                    $response = $responseFactory->createResponse(Status::CONFLICT);
                    $response->getBody()->write(json_encode([
                        'type' => 'about:blank',
                        'title' => Status::TEXTS[Status::CONFLICT],
                        'status' => Status::CONFLICT,
                        'detail' => $exception->getMessage(),
                    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

                    return $response->withHeader(Header::CONTENT_TYPE, 'application/problem+json');
                },
            ],
            'checkResponseBody' => false,
        ],
    ],
];
