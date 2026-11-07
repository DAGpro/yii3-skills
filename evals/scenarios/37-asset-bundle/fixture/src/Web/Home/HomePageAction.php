<?php

declare(strict_types=1);

namespace App\Web\Home;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class HomePageAction
{
    public function __construct(private WebViewRenderer $view) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return $this->view->render('site/index', ['pageTitle' => 'Home']);
    }
}
