---
name: yii3-http-client
description: >-
  Outgoing HTTP requests from Yii3 services via PSR-18: Guzzle setup, DI wiring of ClientInterface and
  PSR-17 factories, GET/JSON patterns, error handling (ClientExceptionInterface vs status codes),
  MockHandler unit tests. Use when user says "call external API", "http client", "send webhook",
  "consume REST API".
argument-hint: "[integration]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 HTTP Client (PSR-18)

Yii has no own HTTP client. Application code depends on PSR-18/PSR-17 interfaces; Guzzle is the
common implementation.

```sh
composer require guzzlehttp/guzzle
```

## DI Wiring

`config/common/di/http-client.php`:

```php
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\HttpFactory;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\{RequestFactoryInterface, ResponseFactoryInterface,
    StreamFactoryInterface, UriFactoryInterface};
use Yiisoft\Definitions\Reference;

return [
    ClientInterface::class => [
        'class' => Client::class,
        '__construct()' => [
            'config' => ['timeout' => 10.0, 'connect_timeout' => 3.0],
        ],
    ],

    RequestFactoryInterface::class => Reference::to(HttpFactory::class),
    ResponseFactoryInterface::class => Reference::to(HttpFactory::class),
    StreamFactoryInterface::class => Reference::to(HttpFactory::class),
    UriFactoryInterface::class => Reference::to(HttpFactory::class),
];
```

Note: this binds the app's outgoing client; do not confuse with the incoming
`ResponseFactoryInterface` used by the web layer — if both exist in one project, use distinct
definitions/aliases.

## GET Pattern

Inject `ClientInterface` + `RequestFactoryInterface`:

```php
final readonly class ReleaseClient
{
    public function __construct(
        private ClientInterface $httpClient,
        private RequestFactoryInterface $requestFactory,
    ) {}

    public function latest(string $owner, string $repository): array
    {
        $request = $this->requestFactory
            ->createRequest('GET', sprintf('https://api.github.com/repos/%s/%s/releases/latest',
                rawurlencode($owner), rawurlencode($repository)))
            ->withHeader('Accept', 'application/vnd.github+json');

        try {
            $response = $this->httpClient->sendRequest($request);
        } catch (ClientExceptionInterface $e) {
            throw new RuntimeException('GitHub request failed.', previous: $e);
        }

        if ($response->getStatusCode() !== 200) {
            throw new RuntimeException(sprintf('GitHub returned HTTP %d.', $response->getStatusCode()));
        }

        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
```

Key distinction: `ClientExceptionInterface` = transport failure; HTTP 404/500 are **valid responses**
— check status codes explicitly in your service.

## JSON POST Pattern

Add `StreamFactoryInterface` and build the body:

```php
$body = $this->streamFactory->createStream(json_encode($payload, JSON_THROW_ON_ERROR));

$request = $this->requestFactory
    ->createRequest('POST', 'https://api.example.com/webhooks')
    ->withHeader('Content-Type', 'application/json')
    ->withHeader('Accept', 'application/json')
    ->withBody($body);

$this->httpClient->sendRequest($request);
```

## Unit Testing with MockHandler

```php
$handler = new MockHandler([
    new Response(200, [], json_encode(['tag_name' => '1.0.0'], JSON_THROW_ON_ERROR)),
]);
$client = new Client(['handler' => HandlerStack::create($handler)]);
$factory = new HttpFactory();

$release = (new ReleaseClient($client, $factory))->latest('yiisoft', 'docs');
$this->assertSame('1.0.0', $release['tag_name']);
```

## Rules

- Services depend on PSR interfaces only — swap Guzzle without touching domain code.
- Use `GuzzleHttp\Client` directly only in infrastructure needing Guzzle features (async, handler
  stacks/middleware).
- Set sane timeouts; wrap transport exceptions with context-rich RuntimeExceptions.
- Secrets (API keys) come from params/env via constructor injection — never hardcode.

## Related Skills

- `/yii3-di` — definition format
- `/yii3-testing` — test doubles strategy
- `/yii3-hardening` — SSL peer validation config (never disable verification)
