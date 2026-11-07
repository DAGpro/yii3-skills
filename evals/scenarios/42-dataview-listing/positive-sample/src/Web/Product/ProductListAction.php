<?php

declare(strict_types=1);

namespace App\Web\Product;

use App\Catalog\Domain\ProductRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ProductListAction
{
    private const PAGE_SIZE = 20;

    public function __construct(
        private ProductRepositoryInterface $products,
        private WebViewRenderer $view,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $page = max(1, (int) ($request->getQueryParams()['page'] ?? 1));

        $paginator = (new OffsetPaginator($this->products->findAll()))
            ->withPageSize(self::PAGE_SIZE)
            ->withCurrentPage($page);

        return $this->view->render('product/list', [
            'pageTitle' => 'Products',
            'paginator' => $paginator,
        ]);
    }
}
