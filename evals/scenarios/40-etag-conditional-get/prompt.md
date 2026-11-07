Our catalog API at GET /api/catalog is polled heavily by client apps, but the payload almost never changes, so every poll re-downloads the full response.

Add conditional GET support to the catalog endpoint:
- Compute an ETag from the catalog version — CatalogRepositoryInterface::version() (bound in config/common/di/catalog.php) changes if and only if the catalog data changes.
- Send the ETag header on full (200) responses.
- When the client sends If-None-Match and it matches the current ETag, answer 304 Not Modified with an empty body instead of re-sending the payload.
