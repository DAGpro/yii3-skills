<?php

declare(strict_types=1);

namespace App\Domain\Order;

final class EventRecorder
{
    /** @var list<object> */
    private array $events = [];

    public function record(object $event): void
    {
        $this->events[] = $event;
    }

    /**
     * @return list<object>
     */
    public function all(): array
    {
        return $this->events;
    }

    public function reset(): void
    {
        $this->events = [];
    }
}
