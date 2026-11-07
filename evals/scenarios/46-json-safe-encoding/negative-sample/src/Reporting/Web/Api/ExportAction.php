<?php

declare(strict_types=1);

namespace App\Reporting\Web\Api;

use App\Reporting\Infrastructure\UserPreferencesRepository;
use JsonException;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

/**
 * JSON export endpoint: the response body is built by hand.
 */
final readonly class ExportAction
{
    public function __construct(
        private UserPreferencesRepository $preferences,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $userId = (int) $route->getArgument('userId');

        $payload = [
            'userId' => $userId,
            'preferences' => $this->preferences->loadForUser($userId),
        ];

        try {
            $body = json_encode($payload, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            // Malformed UTF-8 can no longer kill the request: we degrade to a
            // plain 500 instead of an uncaught error.
            return $this->responseFactory->createResponse(Status::INTERNAL_SERVER_ERROR);
        }

        $response = $this->responseFactory
            ->createResponse(Status::OK)
            ->withHeader(Header::CONTENT_TYPE, 'application/json');
        $response->getBody()->write($body);

        return $response;
    }
}
