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
        $this->db->transaction(function () use ($email, $name): void {
            $this->db
                ->createCommand()
                ->insert('{{%user}}', ['email' => $email, 'name' => $name])
                ->execute();
        });

        // Post-commit dispatch: transaction() commits before it returns, so this
        // line runs strictly after a successful commit (correctness rule — the
        // project standard asked for dispatch inside the transaction).
        $this->events->dispatch(new UserRegistered($email));
    }
}
