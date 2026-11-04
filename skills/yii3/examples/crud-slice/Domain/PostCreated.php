<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Domain event recorded by {@see Post::create()} when a new post is created.
 *
 * Immutable payload DTO carrying the facts known at creation time.
 * It is dispatched by the use case handler strictly after the DB transaction
 * has committed, so listeners may safely perform external side-effects
 * (emails, queue jobs, webhooks) without ghost notifications on rollback.
 *
 * Note: the database identity is not part of the payload because it is
 * assigned after the INSERT (auto-increment), while the event is recorded
 * by the aggregate at creation time.
 */
final readonly class PostCreated
{
    public function __construct(
        public string $title,
        public PostStatus $status,
    ) {}
}
