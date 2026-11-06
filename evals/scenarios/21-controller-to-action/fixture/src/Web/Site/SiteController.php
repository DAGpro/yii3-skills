<?php

declare(strict_types=1);

namespace App\Web\Site;

use App\Blog\Application\StatsService;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

/**
 * Legacy controller-style endpoint: several action methods on one class, wired into the
 * routes as [SiteController::class, 'actionIndex'] callables. Kept working by the
 * MiddlewareFactory controller-handler support, but not the idiomatic Yii3 structure.
 */
final class SiteController
{
    public function __construct(
        private readonly StatsService $stats,
        private readonly DataResponseFactoryInterface $responses,
    ) {}

    public function actionIndex(): ResponseInterface
    {
        return $this->responses->createResponse(['app' => 'acme-blog', 'version' => '1.0']);
    }

    public function actionStats(): ResponseInterface
    {
        return $this->responses->createResponse($this->stats->summary());
    }
}
