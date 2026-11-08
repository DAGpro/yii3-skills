<?php

declare(strict_types=1);

namespace App\Newsletter\Domain;

interface SubscriberRepositoryInterface
{
    public function save(object $subscriber): void;
}

