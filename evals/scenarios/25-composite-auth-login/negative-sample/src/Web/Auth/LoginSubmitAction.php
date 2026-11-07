<?php

declare(strict_types=1);

namespace App\Web\Auth;

use App\User\UserRepository;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Status;
use Yiisoft\Session\SessionInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class LoginSubmitAction
{
    public function __construct(
        private UserRepository $users,
        private SessionInterface $session,
        private ResponseFactoryInterface $responses,
        private WebViewRenderer $view,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array) $request->getParsedBody();
        $login = (string) ($body['login'] ?? '');
        $password = (string) ($body['password'] ?? '');

        $user = $this->users->findByLogin($login);
        if ($user === null || !$user->verifyPassword($password)) {
            $this->session->setFlash('error', 'Invalid login or password.');

            return $this->view->render('auth/login', [
                'pageTitle' => 'Sign in',
                'error' => 'Invalid login or password.',
            ]);
        }

        // Store the authenticated user straight into the session
        $this->session->set('identity', $user);

        return $this->responses->createResponse('<p>Welcome back!</p>');
    }
}
