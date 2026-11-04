<?php

declare(strict_types=1);

namespace App\Presentation;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final readonly class ArrayThingAction
{
    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return ['status' => 'ok'];
    }
}
