<?php

declare(strict_types=1);

namespace {Namespace}\{Feature}\Action;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class {Verb}{Entity}Action
{
    public function __construct(
        private WebViewRenderer $viewRenderer,
        private UrlGeneratorInterface $urlGenerator,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $this->logger->debug('{Verb}{Entity}Action invoked');

        return $this->viewRenderer->render(__DIR__ . '/{action}', [
            'urlGenerator' => $this->urlGenerator,
        ]);
    }
}
