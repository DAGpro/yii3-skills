<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Domain repository interface for Post persistence operations.
 * Defines the contract without binding to any database driver or ORM implementation.
 */
interface PostRepositoryInterface
{
    /**
     * Finds a single post by primary key ID.
     */
    public function findById(int $id): ?Post;

    /**
     * Retrieves all posts ordered by creation date descending.
     *
     * @return list<Post>
     */
    public function findAll(): array;

    /**
     * Persists a post entity (handles both insert and update based on primary key presence).
     */
    public function save(Post $post): void;

    /**
     * Deletes a post entity from storage.
     */
    public function delete(Post $post): void;
}
