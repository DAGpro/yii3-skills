<?php

declare(strict_types=1);

namespace App\Web\Contact;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ContactAction
{
    public function __construct(
        private WebViewRenderer $view,
        private FlashInterface $flash,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        if ($request->getMethod() === 'POST') {
            $email = trim((string) ($request->getParsedBody()['email'] ?? ''));
            if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                $this->flash->add('error', 'Invalid email address');
            } else {
                $this->flash->add('success', 'Message sent successfully');
            }
        }

        return $this->view->render('site/contact', ['pageTitle' => 'Contact us']);
    }
}
