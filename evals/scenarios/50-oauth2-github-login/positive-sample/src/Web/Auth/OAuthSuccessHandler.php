<?php

declare(strict_types=1);

namespace App\Web\Auth;

use App\User\UserRepository;
use Yiisoft\User\CurrentUser;
use Yiisoft\Yii\AuthClient\AuthClientInterface;

/**
 * Maps the provider profile onto a local user and logs them in through the session flow.
 */
final readonly class OAuthSuccessHandler
{
    public function __construct(
        private UserRepository $users,
        private CurrentUser $currentUser,
    ) {}

    public function handle(AuthClientInterface $client): void
    {
        $attributes = $client->getUserAttributes();

        // Fixture storage: the GitHub login matches the seeded local login.
        $user = $this->users->findByLogin((string) ($attributes['login'] ?? ''));
        if ($user === null) {
            return;
        }

        $this->currentUser->login($user);
    }
}
