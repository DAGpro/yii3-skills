<?php

declare(strict_types=1);

use Jose\Component\Core\AlgorithmManager;
use Jose\Component\Signature\Serializer\JWSSerializerManager;
use Yiisoft\Auth\AuthenticatorInterface;
use Yiisoft\Auth\AuthenticatorWithChallengeInterface;
use Yiisoft\Auth\Jwt\JwtMethod;
use Yiisoft\Auth\Jwt\KeyFactory\FromSecret;
use Yiisoft\Auth\Jwt\KeyFactoryInterface;
use Yiisoft\Auth\Jwt\TokenRepository;
use Yiisoft\Auth\Jwt\TokenRepositoryInterface;
use Yiisoft\Injector\Injector;

/** @var array $params */

return [
    // HS256 key material and signature algorithms come from the 'yiisoft/auth-jwt' params group.
    KeyFactoryInterface::class => [
        'class' => FromSecret::class,
        '__construct()' => [$params['yiisoft/auth-jwt']['key']['secret']],
    ],
    AlgorithmManager::class => static function (Injector $injector) use ($params) {
        $algorithms = array_map(
            static fn($algorithm) => \is_string($algorithm) ? $injector->make($algorithm) : $algorithm,
            $params['yiisoft/auth-jwt']['algorithms'] ?? [],
        );
        return $injector->make(AlgorithmManager::class, ['algorithms' => $algorithms]);
    },
    JWSSerializerManager::class => static function (Injector $injector) use ($params) {
        $serializers = array_map(
            static fn($serializer) => \is_string($serializer) ? $injector->make($serializer) : $serializer,
            $params['yiisoft/auth-jwt']['serializers'] ?? [],
        );
        return $injector->make(JWSSerializerManager::class, ['serializers' => $serializers]);
    },
    TokenRepositoryInterface::class => TokenRepository::class,

    // Authenticator consumed by Yiisoft\Auth\Middleware\Authentication: Bearer JWT (HS256).
    AuthenticatorInterface::class => JwtMethod::class,
    AuthenticatorWithChallengeInterface::class => JwtMethod::class,
];
