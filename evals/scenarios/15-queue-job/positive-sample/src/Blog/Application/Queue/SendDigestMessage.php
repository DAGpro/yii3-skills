<?php

declare(strict_types=1);

namespace App\Blog\Application\Queue;

use InvalidArgumentException;
use Yiisoft\Queue\Message\Message;

use function is_array;
use function is_int;
use function sprintf;

/**
 * Pure data message DTO: carries only scalar identifiers, no services, no entities.
 * The worker reconstructs it through fromPayload() during unserialization.
 */
final class SendDigestMessage extends Message
{
    public const TYPE = 'blog.send-digest';

    public function __construct(
        public readonly int $initiatedByUserId,
    ) {}

    public static function fromPayload(string $type, bool|int|float|string|array|null $payload): static
    {
        if ($type !== self::TYPE) {
            throw new InvalidArgumentException(sprintf('Expected message type "%s", got "%s".', self::TYPE, $type));
        }

        if (
            !is_array($payload)
            || !isset($payload['initiatedByUserId']) || !is_int($payload['initiatedByUserId'])
        ) {
            throw new InvalidArgumentException(sprintf('Invalid payload structure for "%s".', self::class));
        }

        return new self(initiatedByUserId: $payload['initiatedByUserId']);
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
            'initiatedByUserId' => $this->initiatedByUserId,
        ];
    }
}
