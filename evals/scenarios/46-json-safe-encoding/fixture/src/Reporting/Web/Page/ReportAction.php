<?php

declare(strict_types=1);

namespace App\Reporting\Web\Page;

use App\Reporting\Infrastructure\UserPreferencesRepository;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Header;
use Yiisoft\Router\CurrentRoute;

/**
 * HTML report page: user preferences are embedded into a script tag
 * so client-side widgets can read them.
 */
final readonly class ReportAction
{
    public function __construct(
        private UserPreferencesRepository $preferences,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $userId = (int) $route->getArgument('userId');
        $preferences = $this->preferences->loadForUser($userId);

        $html = '<!DOCTYPE html>'
            . '<html><head><title>Usage report #' . $userId . '</title></head><body>'
            . '<h1>Usage report #' . $userId . '</h1>'
            . '<script>window.REPORT_PREFERENCES = ' . json_encode($preferences) . ';</script>'
            . '</body></html>';

        $response = $this->responseFactory->createResponse();
        $response->getBody()->write($html);

        return $response->withHeader(Header::CONTENT_TYPE, 'text/html');
    }
}
