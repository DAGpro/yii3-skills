<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Api\StatusService;
use PHPUnit\Framework\TestCase;

final class StatusServiceTest extends TestCase
{
    public function testStatusIsOk(): void
    {
        $service = new StatusService();

        $this->assertSame(['status' => 'ok'], $service->get());
    }
}
