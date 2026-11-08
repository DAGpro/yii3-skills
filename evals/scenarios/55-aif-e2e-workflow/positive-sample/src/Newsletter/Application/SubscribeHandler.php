<?php

declare(strict_types=1);

namespace App\Newsletter\Application;

use App\Newsletter\Application\Event\SubscribedEvent;
use App\Newsletter\Domain\Subscriber;
use App\Newsletter\Domain\SubscriberRepositoryInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class SubscribeHandler
{
    public function __construct(
        private SubscriberRepositoryInterface $subscribers,
        private ConnectionInterface $db,
        private EventDispatcherInterface $dispatcher,
    ) {
    }

    public function handle(SubscribeCommand $command): void
    {
        $existing = $this->subscribers->findByEmail($command->email);
        if ($existing !== null) {
            return;
        }

        $subscriber = Subscriber::create($command->email);

        // Multi-step database persistence wrapped in explicit transaction
        $this->db->transaction(function () use ($subscriber) {
            $this->subscribers->save($subscriber);
        });

        // Mandatory post-commit event dispatching invariant
        $this->dispatcher->dispatch(new SubscribedEvent($subscriber->getEmail()));
    }
}

