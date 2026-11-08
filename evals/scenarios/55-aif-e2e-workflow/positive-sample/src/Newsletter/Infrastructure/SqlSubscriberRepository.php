<?php

declare(strict_types=1);

namespace App\Newsletter\Infrastructure;

use App\Newsletter\Domain\Subscriber;
use App\Newsletter\Domain\SubscriberRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class SqlSubscriberRepository implements SubscriberRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
    ) {
    }

    public function save(Subscriber $subscriber): void
    {
        $this->db->createCommand()->insert('newsletter_subscribers', [
            'email' => $subscriber->getEmail(),
            'created_at' => $subscriber->getCreatedAt(),
        ])->execute();
    }

    public function findByEmail(string $email): ?Subscriber
    {
        $row = $this->db->createCommand(
            'SELECT id, email, created_at FROM newsletter_subscribers WHERE email = :email',
            [':email' => $email]
        )->queryOne();

        if ($row === false) {
            return null;
        }

        return new Subscriber((int)$row['id'], (string)$row['email'], (int)$row['created_at']);
    }
}

