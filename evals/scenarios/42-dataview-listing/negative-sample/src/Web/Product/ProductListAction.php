<?php

declare(strict_types=1);

namespace App\Web\Product;

use App\Catalog\Domain\ProductRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ProductListAction
{
    public function __construct(
        private ProductRepositoryInterface $products,
        private WebViewRenderer $view,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // "Pagination" without a paginator: slice the full row list by hand.
        $rows = iterator_to_array($this->products->findAll()->read(), false);
        $page = max(1, (int) ($request->getQueryParams()['page'] ?? 1));
        $perPage = 10;
        $totalPages = (int) ceil(count($rows) / $perPage);
        $chunk = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return $this->view->render('product/list', [
            'pageTitle' => 'Products',
            'tableHtml' => $this->view->renderPartialAsString('product/_table', ['rows' => $chunk]),
            'page' => $page,
            'totalPages' => $totalPages,
        ]);
    }
}
