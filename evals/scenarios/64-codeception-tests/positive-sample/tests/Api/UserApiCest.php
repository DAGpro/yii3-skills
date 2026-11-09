<?php

declare(strict_types=1);

namespace App\Tests\Api;

use App\Tests\Support\ApiTester;

final class UserApiCest
{
    public function testListUsers(ApiTester $I): void
    {
        $I->sendGet('/api/users');
        $I->seeResponseCodeIs(200);
        $I->seeResponseIsJson();
    }
}
