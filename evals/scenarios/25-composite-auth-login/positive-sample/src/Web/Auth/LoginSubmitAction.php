<?php

declare(strict_types=1);

namespace App\Web\Auth;

use App\User\UserRepository;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\User\CurrentUser;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class LoginSubmitAction
{
    public function __construct(
        private UserRepository $users,
        private FormHydrator $formHydrator,
        private CurrentUser $currentUser,
        private FlashInterface $flash,
        private ResponseFactoryInterface $responses,
        private WebViewRenderer $view,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new LoginForm();

        // 1. Validate the untrusted input before anything touches the credential check
        if (!$this->formHydrator->populateFromPostAndValidate($form, $request)) {
            return $this->view
                ->render('auth/login', ['form' => $form, 'pageTitle' => 'Sign in'])
                ->withStatus(Status::UNPROCESSABLE_ENTITY);
        }

        // 2. Verify the credentials through the repository
        $user = $this->users->findByLogin($form->login);
        if ($user === null || !$user->verifyPassword($form->password)) {
            $this->flash->add('error', 'Invalid login or password.');

            return $this->view
                ->render('auth/login', ['form' => $form, 'pageTitle' => 'Sign in'])
                ->withStatus(Status::UNPROCESSABLE_ENTITY);
        }

        // 3. Log the identity in through the service (regenerates the session ID)
        $this->currentUser->login($user);
        $this->flash->add('success', 'Welcome back!');

        // 4. PRG: never render HTML on POST success
        return $this->responses
            ->createResponse(Status::FOUND)
            ->withHeader(Header::LOCATION, '/dashboard');
    }
}
