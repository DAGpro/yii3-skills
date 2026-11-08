<?php

declare(strict_types=1);

use App\Newsletter\Domain\SubscriberRepositoryInterface;
use App\Newsletter\Infrastructure\SqlSubscriberRepository;

return [
    SubscriberRepositoryInterface::class => SqlSubscriberRepository::class,
];

