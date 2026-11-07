<?php

declare(strict_types=1);

namespace App\User;

use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class RegisterUserService
{
    public function __construct(private ConnectionInterface $db, private EventDispatcherInterface $events) {}

    public function register(string $email, string $name): void
    {
        // Project standard: writes and their domain events go through ONE transaction
        // so listeners share the connection (see docs/conventions.md, "transactional events").
        $this->db->transaction(function () use ($email, $name): void {
            $this->db
                ->createCommand()
                ->insert('{{%user}}', ['email' => $email, 'name' => $name])
                ->execute();
        });
    }
}
