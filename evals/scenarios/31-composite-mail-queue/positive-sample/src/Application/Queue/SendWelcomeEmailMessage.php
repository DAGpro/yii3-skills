<?php

declare(strict_types=1);

namespace App\Application\Queue;

use InvalidArgumentException;
use Yiisoft\Queue\Message\Message;

use function is_array;
use function is_string;
use function sprintf;

/**
 * Pure data message DTO: carries only scalar identifiers (no services, no entities).
 * The worker reconstructs it through fromPayload() during unserialization.
 */
final class SendWelcomeEmailMessage extends Message
{
    public const TYPE = 'blog.welcome-email';

    public function __construct(
        public readonly string $email,
        public readonly string $name,
    ) {}

    public static function fromPayload(string $type, bool|int|float|string|array|null $payload): static
    {
        if ($type !== self::TYPE) {
            throw new InvalidArgumentException(sprintf('Expected message type "%s", got "%s".', self::TYPE, $type));
        }

        if (
            !is_array($payload)
            || !isset($payload['email'], $payload['name'])
            || !is_string($payload['email'])
            || !is_string($payload['name'])
        ) {
            throw new InvalidArgumentException(sprintf('Invalid payload structure for "%s".', self::class));
        }

        return new self(email: $payload['email'], name: $payload['name']);
    }

    public function getType(): string
    {
        return self::TYPE;
    }

    /**
     * @return array<string, scalar|null>
     */
    public function getPayload(): array
    {
        return [
            'email' => $this->email,
            'name' => $this->name,
        ];
    }
}
