# Yii3 HTTP Response Caching Guide (ETag & Conditional Requests)

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> HTTP-layer caching around the PSR-15 middleware pipeline: RFC 7232 conditional-request mechanics, the declarative `HttpCacheMiddleware` from `yiisoft/http-middleware` (ETag / `Last-Modified` providers and suffix normalization), and programmatic action-level conditional GET.

**Scope & Ownership:** This guide is the single source of truth for HTTP response caching with ETag and `Last-Modified` revalidation; it was extracted from the [Caching & Performance Guide, §6](persistence-caching.md#6-http-response-caching-etag--conditional-requests). This is **HTTP-layer caching** — client, browser, and CDN revalidation of whole responses around the middleware pipeline — and is distinct from **application data caching** (PSR-16 stores, `getOrSet()`, tag invalidation), which is owned by the parent [Caching & Performance Guide](persistence-caching.md). The middleware catalogue and pipeline placement rules are owned by the [PSR-15 Middlewares Guide](http-middlewares.md).

---

## Table of Contents
- [1. RFC 7232 Mechanics & Suffix Normalization](#1-rfc-7232-mechanics--suffix-normalization)
- [2. Declarative PSR-15 Middleware (HttpCacheMiddleware)](#2-declarative-psr-15-middleware-httpcachemiddleware)
- [3. Programmatic Action-Level Conditional GET](#3-programmatic-action-level-conditional-get)
- [Related Topic Guides](#related-topic-guides)

---

## 1. RFC 7232 Mechanics & Suffix Normalization

HTTP conditional caching enables browsers and edge CDNs to validate cached representations:
- **Weak Validators (`W/"..."`):** Indicate semantic equality rather than byte-for-byte identical representation (e.g. minified vs formatted JSON).
- **Multi-Value `If-None-Match`:** Clients or proxies may send multiple comma-separated ETags: `If-None-Match: "tag1", "tag2", W/"tag3"`.
- **Compression Suffixes (`-gzip`, `-br`):** Web servers like Apache (`mod_deflate`, `mod_brotli`) alter ETag values by appending compression suffixes. Without normalization, client ETags will fail to match server entity tags, causing 304 validation to fail.
- **Automatic 304 Not Modified:** When ETags match or `If-Modified-Since` is unchanged, the server must emit a `304 Not Modified` response without a message body.

## 2. Declarative PSR-15 Middleware (HttpCacheMiddleware)

The `yiisoft/http-middleware` package provides `Yiisoft\HttpMiddleware\HttpCache\HttpCacheMiddleware` to handle RFC 7232 negotiation automatically.

Constructor dependencies:
- `ResponseFactoryInterface $responseFactory`
- `CacheControlProviderInterface $cacheControlProvider = new NullCacheControlProvider()`
- `LastModifiedProviderInterface $lastModifiedProvider = new NullLastModifiedProvider()`
- `ETagProviderInterface $eTagProvider = new NullETagProvider()`
- `ETagGeneratorInterface $eTagGenerator = new DefaultETagGenerator()`
- `ETagValueNormalizerInterface $eTagValueNormalizer = new NoopETagValueNormalizer()`

Implement custom providers for your domain models:

```php
declare(strict_types=1);

namespace App\Blog\Http;

use App\Blog\Domain\BlogPostRepositoryInterface;
use DateTimeImmutable;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\HttpMiddleware\HttpCache\ETag;
use Yiisoft\HttpMiddleware\HttpCache\ETagProvider\ETagProviderInterface;
use Yiisoft\HttpMiddleware\HttpCache\LastModifiedProvider\LastModifiedProviderInterface;
use Yiisoft\Router\CurrentRoute;

final readonly class BlogPostETagProvider implements ETagProviderInterface
{
    public function __construct(
        private BlogPostRepositoryInterface $repository,
        private CurrentRoute $currentRoute,
    ) {}

    public function get(ServerRequestInterface $request): ?ETag
    {
        $id = (string) $this->currentRoute->getArgument('id', '');
        $post = $this->repository->findById($id);
        if ($post === null) {
            return null;
        }

        $seed = $post->getUpdatedAt()->format(\DateTimeInterface::ATOM) . ':' . $post->getTitle();

        return new ETag(seed: $seed, weak: false);
    }
}

final readonly class BlogPostLastModifiedProvider implements LastModifiedProviderInterface
{
    public function __construct(
        private BlogPostRepositoryInterface $repository,
        private CurrentRoute $currentRoute,
    ) {}

    public function get(ServerRequestInterface $request): ?DateTimeImmutable
    {
        $id = (string) $this->currentRoute->getArgument('id', '');
        $post = $this->repository->findById($id);

        return $post?->getUpdatedAt();
    }
}
```

Wire the middleware into route definitions in `config/common/routes.php`:

```php
declare(strict_types=1);

use App\Blog\Action\ViewPostAction;
use App\Blog\Http\BlogPostETagProvider;
use App\Blog\Http\BlogPostLastModifiedProvider;
use Psr\Http\Message\ResponseFactoryInterface;
use Yiisoft\HttpMiddleware\HttpCache\CacheControlProvider\ConstantCacheControlProvider;
use Yiisoft\HttpMiddleware\HttpCache\ETagValueNormalizer\SuffixETagValueNormalizer;
use Yiisoft\HttpMiddleware\HttpCache\HttpCacheMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;

return [
    (new Group('/blog'))->routes(
        (new Get('/post/{id:\d+}'))
            ->middleware(static fn (
                ResponseFactoryInterface $responseFactory,
                BlogPostETagProvider $eTagProvider,
                BlogPostLastModifiedProvider $lastModifiedProvider,
            ): HttpCacheMiddleware => new HttpCacheMiddleware(
                responseFactory: $responseFactory,
                cacheControlProvider: new ConstantCacheControlProvider('public, max-age=3600, must-revalidate'),
                lastModifiedProvider: $lastModifiedProvider,
                eTagProvider: $eTagProvider,
                eTagValueNormalizer: new SuffixETagValueNormalizer(['-gzip', '-br']),
            ))
            ->action(ViewPostAction::class),
    ),
];
```

## 3. Programmatic Action-Level Conditional GET

For lightweight scenarios without route middleware:

```php
declare(strict_types=1);

namespace App\Blog\Action;

use App\Blog\Application\GetBlogPostService;
use App\Blog\Domain\BlogPost;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class ViewPostAction
{
    public function __construct(
        private GetBlogPostService $postService,
        // Canonical factory from the ResponseFactory sub-namespace (wraps the payload
        // into a DataStream body). The deprecated root-namespace twin must not be used.
        private \Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface $dataResponseFactory,
        private ResponseFactoryInterface $responseFactory,
        private CurrentRoute $currentRoute,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = (string) $this->currentRoute->getArgument('id', '');
        $post = $this->postService->findById($id);

        if (!$post instanceof BlogPost) {
            return $this->responseFactory->createResponse(Status::NOT_FOUND);
        }

        $etag = '"' . sha1($post->getId() . ':' . $post->getUpdatedAt()->getTimestamp()) . '"';
        $clientEtag = $request->getHeaderLine(Header::IF_NONE_MATCH);

        if ($clientEtag === $etag) {
            // RFC 7232 §4.1: a 304 must carry the ETag and Cache-Control headers
            // (this mirrors what HttpCacheMiddleware itself adds to 304 responses).
            return $this->responseFactory
                ->createResponse(Status::NOT_MODIFIED)
                ->withHeader(Header::ETAG, $etag)
                ->withHeader(Header::CACHE_CONTROL, 'public, max-age=3600, must-revalidate');
        }

        return $this->dataResponseFactory
            ->createResponse($post->toArray())
            ->withHeader(Header::ETAG, $etag)
            ->withHeader(Header::CACHE_CONTROL, 'public, max-age=3600, must-revalidate');
    }
}
```

> [!NOTE]
> The strict `$clientEtag === $etag` comparison above handles a **single plain ETag value** only. It fails on multi-value headers (`"tag1", "tag2"`) and weak validators (`W/"..."`), which §1 documents. `HttpCacheMiddleware` parses the full `If-None-Match` line itself — splitting on commas and stripping `W/` prefixes and quotes — so for multi-value or weak-validator revalidation, prefer the declarative middleware from §2.

## Related Topic Guides

- [Caching & Performance Guide](persistence-caching.md) — Application data caching: PSR-16 drivers, `getOrSet()` stampede prevention, tag invalidation, and view fragment caching.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Middleware catalogue, global pipeline wiring, and route middleware placement (including the `HttpCacheMiddleware` entry).
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Invokable action classes and response-factory usage for the programmatic conditional-GET recipe.
- [Routing Guide](http-routes.md) — Route groups and per-route middleware attachment used in the `HttpCacheMiddleware` wiring.
