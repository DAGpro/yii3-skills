# Yii3 Payment Gateways & Webhooks (`yiisoft/payments`)

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Architecture and implementation guide for unified payment gateway abstraction, multi-provider payment processing (Stripe, PayPal, YooKassa, Robokassa), payment intents, and PSR-7/PSR-15 webhook processing with signature verification using `yiisoft/payments`.

---

## Table of Contents

- [1. Architecture & Core Contracts](#1-architecture--core-contracts)
  - [1.1. Decoupled Payment Processing](#11-decoupled-payment-processing)
  - [1.2. Core Data Models](#12-core-data-models)
- [2. Supported Gateway Drivers](#2-supported-gateway-drivers)
  - [2.1. Driver Comparison & Capabilities](#21-driver-comparison--capabilities)
  - [2.2. Gateway Instantiation & PSR-18 Clients](#22-gateway-instantiation--psr-18-clients)
- [3. Dependency Injection Configuration](#3-dependency-injection-configuration)
- [4. Payment Intent Lifecycle & Checkout Flow](#4-payment-intent-lifecycle--checkout-flow)
  - [4.1. Creating a Payment Intent (Thin Action)](#41-creating-a-payment-intent-thin-action)
  - [4.2. Confirming & Capturing Payments](#42-confirming--capturing-payments)
- [5. Webhook Processing Architecture](#5-webhook-processing-architecture)
  - [5.1. The Webhook Processing Pipeline](#51-the-webhook-processing-pipeline)
  - [5.2. PSR-15 Webhook Controller Action](#52-psr-15-webhook-controller-action)
- [6. Anti-Pattern Matrix](#6-anti-pattern-matrix)
- [7. Related Topic Guides](#7-related-topic-guides)

---

## 1. Architecture & Core Contracts

### 1.1. Decoupled Payment Processing

The `yiisoft/payments` package provides a framework-agnostic, PSR-compliant abstraction over disparate payment service providers. Rather than coupling domain models and checkout actions directly to provider-specific SDKs (such as `stripe/stripe-php` or PayPal SDKs), applications depend on the unified contract `Yiisoft\Payments\PaymentGatewayInterface`:

```php
declare(strict_types=1);

namespace Yiisoft\Payments;

use Yiisoft\Payments\Models\Customer;
use Yiisoft\Payments\Models\PaymentIntent;
use Yiisoft\Payments\Models\PaymentMethod;

interface PaymentGatewayInterface
{
    public function createCustomer(Customer $customer): Customer;
    public function retrieveCustomer(string $customerId): Customer;
    public function updateCustomer(Customer $customer): Customer;
    public function deleteCustomer(string $customerId): void;

    public function createPaymentMethod(PaymentMethod $paymentMethod): PaymentMethod;
    public function attachPaymentMethod(string $paymentMethodId, string $customerId): PaymentMethod;

    public function createPaymentIntent(PaymentIntent $intent): PaymentIntent;
    public function confirmPaymentIntent(string $intentId, array $params = []): PaymentIntent;
    public function capturePaymentIntent(string $intentId, array $params = []): PaymentIntent;
    public function cancelPaymentIntent(string $intentId, array $params = []): PaymentIntent;
    public function retrievePaymentIntent(string $intentId): PaymentIntent;

    public function createRefund(string $paymentIntentId, array $params = []): array;
}
```

### 1.2. Core Data Models

`yiisoft/payments` uses strictly typed, immutable PHP 8.2+ `readonly class` models in `Yiisoft\Payments\Models`:

- **`PaymentIntent`** — Represents a payment transaction lifecycle. Exposes standard status constants:
  - `PaymentIntent::STATUS_REQUIRES_PAYMENT_METHOD` (`'requires_payment_method'`)
  - `PaymentIntent::STATUS_REQUIRES_CONFIRMATION` (`'requires_confirmation'`)
  - `PaymentIntent::STATUS_REQUIRES_ACTION` (`'requires_action'`)
  - `PaymentIntent::STATUS_PROCESSING` (`'processing'`)
  - `PaymentIntent::STATUS_REQUIRES_CAPTURE` (`'requires_capture'`)
  - `PaymentIntent::STATUS_CANCELED` (`'canceled'`)
  - `PaymentIntent::STATUS_SUCCEEDED` (`'succeeded'`)
- **`Customer`** — Represents a customer profile (`id`, `email`, `name`, `phone`, `metadata`).
- **`PaymentMethod`** — Represents a saved payment method (`id`, `type`, `customerId`, `details`, `metadata`).

```php
declare(strict_types=1);

use Yiisoft\Payments\Models\PaymentIntent;

$intent = new PaymentIntent(
    amount: 5000, // 50.00 in minor currency units (cents)
    currency: 'USD',
    description: 'Order #1042',
    metadata: ['order_id' => '1042'],
);
```

---

## 2. Supported Gateway Drivers

### 2.1. Driver Comparison & Capabilities

`yiisoft/payments` ships with four built-in gateway implementations under `Yiisoft\Payments\Gateways`:

| Gateway Class | Provider | Protocol | Sandboxing Support | Webhook Verification |
|:---|:---|:---|:---:|:---:|
| `Yiisoft\Payments\Gateways\StripeGateway` | Stripe | REST API v1 | Supported | Native secret + signature check |
| `Yiisoft\Payments\Gateways\PayPalGateway` | PayPal | REST API v2 | Supported (`sandbox: true`) | Webhook ID + cert signature |
| `Yiisoft\Payments\Gateways\YooKassaGateway` | YooKassa | REST API v3 | Supported | IP range validation / basic auth |
| `Yiisoft\Payments\Gateways\RobokassaGateway` | Robokassa | Merchant API | Supported (`isTest: true`) | MD5/SHA signature checksums |

### 2.2. Gateway Instantiation & PSR-18 Clients

All gateways extend `Yiisoft\Payments\Gateways\AbstractGateway` and communicate over HTTP exclusively through standard PSR-18 HTTP client (`Psr\Http\Client\ClientInterface`) and PSR-17 factory interfaces (`Psr\Http\Message\RequestFactoryInterface`, `Psr\Http\Message\StreamFactoryInterface`).

```shell
composer require yiisoft/payments
```

---

## 3. Dependency Injection Configuration

Bind the chosen gateway in application DI (`config/common/di/payments.php`). Inject standard PSR-18 and PSR-17 services provided by your HTTP client bridge (e.g. `symfony/http-client` with PSR-18 bridge, or `guzzlehttp/guzzle`):

```php
declare(strict_types=1);

use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Payments\Gateways\StripeGateway;
use Yiisoft\Payments\PaymentGatewayInterface;

/** @var array $params */

return [
    PaymentGatewayInterface::class => static function (
        ClientInterface $httpClient,
        RequestFactoryInterface $requestFactory,
        StreamFactoryInterface $streamFactory,
        LoggerInterface $logger,
    ) use ($params): PaymentGatewayInterface {
        return new StripeGateway(
            apiKey: (string) $params['app']['payments']['stripe']['apiKey'],
            httpClient: $httpClient,
            requestFactory: $requestFactory,
            streamFactory: $streamFactory,
            logger: $logger,
        );
    },
];
```

In `config/params.php`, provide provider credentials from environment variables:

```php
declare(strict_types=1);

return [
    'app' => [
        'payments' => [
            'stripe' => [
                'apiKey' => $_ENV['STRIPE_SECRET_KEY'] ?? '',
                'webhookSecret' => $_ENV['STRIPE_WEBHOOK_SECRET'] ?? '',
            ],
        ],
    ],
];
```

---

## 4. Payment Intent Lifecycle & Checkout Flow

### 4.1. Creating a Payment Intent (Thin Action)

In a checkout HTTP action, instantiate the payment intent DTO, delegate creation to `PaymentGatewayInterface`, and return the client secret or transaction identifier to the frontend:

```php
declare(strict_types=1);

namespace App\Presentation\Api\Checkout;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Payments\Models\PaymentIntent;
use Yiisoft\Payments\PaymentGatewayInterface;

final readonly class CreatePaymentIntentAction
{
    public function __construct(
        private PaymentGatewayInterface $gateway,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        /** @var array $body */
        $body = $request->getParsedBody();
        $amount = (int) ($body['amount'] ?? 0);
        $orderId = (string) ($body['orderId'] ?? '');

        if ($amount <= 0 || $orderId === '') {
            return $this->responseFactory->createResponse(
                ['error' => 'Invalid order details.'],
                Status::BAD_REQUEST,
            );
        }

        $intent = new PaymentIntent(
            amount: $amount,
            currency: 'USD',
            description: 'Order #' . $orderId,
            metadata: ['order_id' => $orderId],
        );

        $created = $this->gateway->createPaymentIntent($intent);

        return $this->responseFactory->createResponse([
            'intentId' => $created->id,
            'clientSecret' => $created->clientSecret,
            'status' => $created->status,
        ]);
    }
}
```

### 4.2. Confirming & Capturing Payments

For two-step payment workflows (authorize first, capture on fulfillment):
1. Create intent with `captureMethod: false`.
2. On authorization confirmation: `$gateway->confirmPaymentIntent($intentId)`.
3. When goods are shipped: `$gateway->capturePaymentIntent($intentId)`.
4. If cancelled before shipment: `$gateway->cancelPaymentIntent($intentId)`.

---

## 5. Webhook Processing Architecture

### 5.1. The Webhook Processing Pipeline

`yiisoft/payments` provides a unified webhook processing engine via `Yiisoft\Payments\Webhooks\WebhookProcessor`:

```
Incoming Webhook HTTP Request (PSR-7)
                 │
                 ▼
Yiisoft\Payments\Webhooks\WebhookInput (rawBody, headers, providerId)
                 │
                 ▼
WebhookProviderValidatorRegistry ──► WebhookStripeValidator (verifies signature)
                 │
                 ▼
WebhookProviderProcessorRegistry ──► WebhookStripeProviderProcessor (parses payload)
                 │
                 ▼
Yiisoft\Payments\Webhooks\WebhookContext (eventType, paymentStatus, rawData)
```

### 5.2. PSR-15 Webhook Controller Action

```php
declare(strict_types=1);

namespace App\Presentation\Api\Checkout;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Payments\Webhooks\WebhookInput;
use Yiisoft\Payments\Webhooks\WebhookProcessor;

final readonly class PaymentWebhookAction
{
    public function __construct(
        private WebhookProcessor $webhookProcessor,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $rawBody = (string) $request->getBody();
        $headers = $request->getHeaders();

        $input = new WebhookInput(
            rawBody: $rawBody,
            headers: $headers,
            providerId: 'stripe',
        );

        $context = $this->webhookProcessor->process($input);

        if ($context->validationFailureReason !== null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Invalid webhook signature.'],
                Status::BAD_REQUEST,
            );
        }

        // Handle mapped payment status (e.g. update order state)
        if ($context->paymentStatus === 'succeeded') {
            // Trigger domain order completion logic
        }

        return $this->responseFactory->createResponse(['received' => true]);
    }
}
```

---

## 6. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|:---|:---|:---|
| **Injecting concrete `StripeGateway` into Domain or Actions** | Violates Dependency Inversion; tightly couples business logic to Stripe, preventing provider swaps and offline testing. | Inject `PaymentGatewayInterface` and let DI resolve the configured provider. |
| **Parsing JSON before passing to `WebhookInput`** | Webhook signature verification requires the bit-for-bit identical raw request body. Decoding JSON re-serializes with whitespace variations, breaking cryptographic signature checks. | Pass raw unparsed body via `(string) $request->getBody()` into `WebhookInput::$rawBody`. |
| **Passing float amounts (e.g. `19.99`) to `PaymentIntent::$amount`** | Float rounding errors cause penny-loss discrepancies and gateway rejection. Gateways require integers in minor currency units (cents/kopecks). | Supply integer minor units (`1999` for `$19.99` USD). |
| **Calling payment gateways directly inside database transactions** | Gateway network latency (200–2000 ms) holds DB locks open, causing pool exhaustion. If the DB transaction rolls back later, the payment was already charged. | Charge the payment gateway outside the database transaction, or record a pending order, charge gateway, then record completion post-charge. |
| **Omitting PSR-18 HTTP client in container definitions** | Gateways depend on standard `ClientInterface`. Using `cURL` or `file_get_contents` directly breaks mocking and testing. | Configure standard PSR-18 client in `config/common/di/payments.php`. |

---

## 7. Related Topic Guides

- [Package Catalog & Dependency Reference](package-catalog.md) — Capability matrix and driver selection for `yiisoft/payments`.
- [Core Architecture Alignment Guide](core-architecture-alignment.md) — Boundary placement of payment gateways in `Infrastructure/` implementing domain ports.
- [HTTP Core Actions Guide](http-actions-core.md) — Thin presentation actions returning PSR-7 responses.
- [Transactional Outbox Guide](infra-transactional-outbox.md) — Reliable domain event dispatching after payment completion.
