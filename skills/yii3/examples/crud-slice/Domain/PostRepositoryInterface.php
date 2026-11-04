<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Domain repository interface (port) for Post persistence operations.
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
     * Reports whether a post with the given title already exists
     * (uniqueness pre-check performed by the use case handler
     * BEFORE opening the DB transaction).
     */
    public function existsByTitle(string $title): bool;

    /**
     * Persists a new post (INSERT) and assigns the database identity
     * to the aggregate via {@see Post::assignId()}.
     */
    public function save(Post $post): void;

    /**
     * Deletes a post entity from storage.
     */
    public function delete(Post $post): void;
}
