<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use Yiisoft\Http\Method;
use Yiisoft\Http\Status;
use Yiisoft\Yii\Testing\FunctionalTestCase;
use Yiisoft\Yii\Testing\ResponseAccessor;

final class StatusTest extends FunctionalTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Boot the application in-memory before any request.
        $this->bootstrapApplication();
    }

    public function testStatusEndpointReturnsOk(): void
    {
        /** @var ResponseAccessor $response */
        $response = $this->tester->doRequest(
            method: Method::GET,
            url: '/api/status',
        );

        $this->assertSame(Status::OK, $response->getStatusCode());

        $data = $response->getContentAsJson();
        $this->assertIsArray($data);
        $this->assertSame('ok', $data['status']);
    }
}
