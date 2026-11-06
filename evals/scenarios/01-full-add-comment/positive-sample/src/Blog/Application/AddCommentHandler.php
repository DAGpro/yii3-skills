<?php

declare(strict_types=1);

namespace App\Blog\Application;

use App\Blog\Domain\Comment;
use App\Blog\Domain\CommentAdded;
use App\Blog\Domain\CommentRepositoryInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class AddCommentHandler
{
    public function __construct(
        private ConnectionInterface $db,
        private CommentRepositoryInterface $comments,
        private EventDispatcherInterface $events,
    ) {}

    public function __invoke(int $postId, string $body): void
    {
        $this->db->transaction(function () use ($postId, $body): void {
            $this->comments->save(new Comment($postId, $body));
        });
        $this->events->dispatch(new CommentAdded($postId));
    }
}
