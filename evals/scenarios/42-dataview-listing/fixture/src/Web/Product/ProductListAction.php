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
        return $this->view->render('product/list', [
            'pageTitle' => 'Products',
            'products' => $this->products->findAll()->read(),
        ]);
    }
}
