<?php

declare(strict_types=1);

namespace App\Presentation;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class SqlThingAction
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $rows = $this->db->createCommand('SELECT * FROM {{%thing}}')->queryAll();

        return $this->respond($rows);
    }

    private function respond(array $rows): ResponseInterface
    {
        return new \Yiisoft\DataResponse\DataResponse($rows);
    }
}
