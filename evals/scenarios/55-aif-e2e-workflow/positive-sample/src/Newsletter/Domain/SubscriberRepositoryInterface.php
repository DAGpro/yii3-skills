<?php

declare(strict_types=1);

namespace App\Newsletter\Domain;

interface SubscriberRepositoryInterface
{
    public function save(Subscriber $subscriber): void;
    public function findByEmail(string $email): ?Subscriber;
}

