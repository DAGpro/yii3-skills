<?php

declare(strict_types=1);

namespace App\Blog\Application;

use App\Blog\Domain\PostRepositoryInterface;
use Yiisoft\Cache\CacheInterface;

final readonly class LatestPostsService
{
    public function __construct(
        private CacheInterface $cache,
        private PostRepositoryInterface $posts,
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function latestPosts(int $limit = 10): array
    {
        return $this->cache->getOrSet(
            key: ['blog.latest', $limit],
            callable: fn (): array => $this->posts->findLatest($limit),
            ttl: 900,
        );
    }
}
