<?php

declare(strict_types=1);

namespace App\Web\Auth;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class LoginFormAction
{
    public function __construct(private WebViewRenderer $view) {}

    public function __invoke(): ResponseInterface
    {
        return $this->view->render('auth/login', [
            'pageTitle' => 'Sign in',
        ]);
    }
}
