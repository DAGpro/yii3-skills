<?php

declare(strict_types=1);

use Nyholm\Psr7\Factory\Psr17Factory;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestFactoryInterface;
use Symfony\Component\HttpClient\Psr18Client;

return [
    ClientInterface::class => Psr18Client::class,
    RequestFactoryInterface::class => Psr17Factory::class,
];
