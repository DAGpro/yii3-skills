<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\Comment;
use App\Blog\Domain\CommentRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class DbCommentRepository implements CommentRepositoryInterface
{
    public function __construct(private ConnectionInterface $db) {}

    public function save(Comment $comment): void
    {
        $this->db->createCommand()->insert('comment', ['post_id' => $comment->postId, 'body' => $comment->body])->execute();
    }
}
