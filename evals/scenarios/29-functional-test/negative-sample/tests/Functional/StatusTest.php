<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use PHPUnit\Framework\TestCase;

final class StatusTest extends TestCase
{
    public function testStatusEndpointReturnsOkJson(): void
    {
        $body = file_get_contents('http://localhost:8080/api/status');
        $this->assertNotFalse($body, 'The dev server must be running: composer serve');

        $data = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('ok', $data['status']);
    }
}
