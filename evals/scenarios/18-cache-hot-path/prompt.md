GET /posts/latest is our hottest path: LatestPostsService::latestPosts() queries the database on every single request.

Cache it so the repository is queried at most once per TTL window:
- Cache the result of PostRepositoryInterface::findLatest() as a read-through cache entry with a TTL of 900 seconds (15 minutes).
- The cache must be injected through the constructor as Yiisoft\Cache\CacheInterface - do not type-hint PSR-16 CacheInterface in the service and do not use any static locator access.
- yiisoft/cache-file is already required in composer.json: wire it as the persistent PSR-16 store in the DI config, overriding the default ArrayCache binding.
