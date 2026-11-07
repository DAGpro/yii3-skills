<?php

declare(strict_types=1);

namespace App\Reporting\Infrastructure;

use Yiisoft\Json\Json;

/**
 * Storage stub: preferences are persisted as a raw JSON column.
 * The column content is user-provided data, so values may contain any HTML.
 */
final readonly class UserPreferencesRepository
{
    private const STORED = [
        42 => '{"theme":"dark","bio":"I <3 typography & <b>big</b> fonts","notifications":{"email":true}}',
    ];

    /**
     * @return array<string, mixed>
     */
    public function loadForUser(int $userId): array
    {
        $json = self::STORED[$userId] ?? '{}';

        // Exception-safe: malformed JSON throws JsonException instead of
        // silently decoding to null; an empty column safely decodes to null.
        return (array) Json::decode($json);
    }
}
