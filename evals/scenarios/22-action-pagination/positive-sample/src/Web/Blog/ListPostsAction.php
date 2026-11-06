<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Domain\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Paginator\PageNotFoundException;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class ListPostsAction
{
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private PostRepositoryInterface $posts,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $params = $request->getQueryParams();
        $page = max(1, (int) ($params['page'] ?? 1));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) ($params['pageSize'] ?? self::DEFAULT_PAGE_SIZE)));

        $paginator = (new OffsetPaginator($this->posts->findAll()))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);

        try {
            $items = iterator_to_array($paginator->read());
        } catch (PageNotFoundException) {
            return $this->responses->createResponse(['error' => 'Page not found.'], Status::NOT_FOUND);
        }

        return $this->responses->createResponse([
            'data' => $items,
            'pagination' => [
                'currentPage' => $paginator->getCurrentPage(),
                'pageSize' => $paginator->getPageSize(),
                'totalItems' => $paginator->getTotalItems(),
                'totalPages' => $paginator->getTotalPages(),
            ],
        ], Status::OK);
    }
}
