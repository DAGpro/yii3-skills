<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\SettingsService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class SaveSettingsAction
{
    public function __construct(
        private SettingsService $settings,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = $request->getParsedBody();
        $title = $body['title'] ?? '';
        if (mb_strlen($title) < 1 || mb_strlen($title) > 100) {
            return $this->responses->createResponse(['error' => 'invalid title'], 422);
        }
        $perPage = (int) ($body['postsPerPage'] ?? 10);
        $this->settings->save($title, $perPage, (string) ($body['description'] ?? ''));
        return $this->responses->createResponse(['status' => 'saved']);
    }
}
