<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\PostStatus;

/**
 * Application-layer command (intent DTO) for creating a post.
 *
 * The presentation layer builds it from a validated input DTO;
 * the use case handler consumes it. Carrying a `PostStatus` enum
 * (not a raw string) keeps the handler domain-type-safe.
 */
final readonly class CreatePostCommand
{
    public function __construct(
        public string $title,
        public string $content,
        public PostStatus $status,
    ) {}
}
