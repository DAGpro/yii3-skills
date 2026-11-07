<?php

declare(strict_types=1);

namespace App\Web\Auth;

use App\User\UserRepository;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\User\CurrentUser;

final readonly class GithubCallbackAction
{
    public function __construct(
        private UserRepository $users,
        private CurrentUser $currentUser,
        private ResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $code = (string) ($request->getQueryParams()['code'] ?? '');

        // Exchange the authorization code for an access token
        $ch = curl_init('https://github.com/login/oauth/access_token');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'client_id' => 'Iv1.abc123def456',
            'client_secret' => 'ghp_placeholder_secret',
            'code' => $code,
            'redirect_uri' => '/auth/callback',
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
        $tokenResponse = (string) curl_exec($ch);
        curl_close($ch);

        $tokenData = json_decode($tokenResponse, true) ?? [];
        $accessToken = (string) ($tokenData['access_token'] ?? '');

        // Fetch the GitHub profile
        $context = stream_context_create([
            'http' => [
                'header' => "Authorization: Bearer {$accessToken}\r\nUser-Agent: acme-blog\r\n",
            ],
        ]);
        $profile = json_decode((string) file_get_contents('https://api.github.com/user', false, $context), true) ?? [];

        $user = $this->users->findByLogin((string) ($profile['login'] ?? ''));
        if ($user !== null) {
            $this->currentUser->login($user);
        }

        return $this->responses
            ->createResponse(Status::FOUND)
            ->withHeader(Header::LOCATION, '/dashboard');
    }
}
