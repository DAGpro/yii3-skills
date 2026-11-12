GET /posts/latest is our hottest path: LatestPostsService::latestPosts() queries the database on every single request.

Cache it so the repository is queried at most once per 15 minutes:

- Cache the result of PostRepositoryInterface::findLatest() so the underlying query runs at most once per TTL window.
- The cache must be injected through the constructor - type-hint the framework cache component interface (the yiisoft/cache one, not the raw PSR-16 client) and do not use any static locator access.
- yiisoft/cache-file is already required in composer.json: make the cached data persist across worker restarts by using it as the storage behind the cache component instead of the default in-memory one.
