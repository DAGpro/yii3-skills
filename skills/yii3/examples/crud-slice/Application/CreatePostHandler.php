<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Post;
use App\Domain\PostRepositoryInterface;
use DomainException;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

/**
 * Use case handler for the "create post" business process.
 *
 * Anatomy (strict order):
 * 1. Domain checks — uniqueness pre-check via the repository port; failures
 *    abort before any DB write (nothing is written, no events are recorded).
 * 2. Transaction — aggregate creation + persistence run inside
 *    `ConnectionInterface::transaction()`, which commits before it returns
 *    and rolls back + re-throws on any `Throwable`.
 * 3. Post-commit event dispatch — `releaseEvents()` is drained strictly
 *    after `transaction()` has returned (i.e. after a successful commit),
 *    so listeners can never fire for a rolled-back write.
 */
final readonly class CreatePostHandler
{
    public function __construct(
        private ConnectionInterface $db,
        private PostRepositoryInterface $posts,
        private EventDispatcherInterface $eventDispatcher,
    ) {}

    public function handle(CreatePostCommand $command): Post
    {
        // 1. Domain checks (before any write).
        if ($this->posts->existsByTitle($command->title)) {
            throw new DomainException("A post with the title '{$command->title}' already exists.");
        }

        // 2. Atomic persistence. Commits before returning; rolls back and
        //    re-throws on failure, so the code below never runs on rollback.
        $post = $this->db->transaction(function () use ($command): Post {
            $post = Post::create($command->title, $command->content, $command->status);
            $this->posts->save($post);
            return $post;
        });

        // 3. Dispatch events STRICTLY after the transaction has committed.
        foreach ($post->releaseEvents() as $event) {
            $this->eventDispatcher->dispatch($event);
        }

        return $post;
    }
}
