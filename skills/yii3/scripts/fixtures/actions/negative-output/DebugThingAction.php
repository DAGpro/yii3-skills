<?php

declare(strict_types=1);

namespace App\Presentation;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final readonly class DebugThingAction
{
    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        echo 'debug output';
        print($request->getMethod());

        if ($request->getMethod() === 'X') {
            exit(1);
        }

        die;
    }
}
