<?php

declare(strict_types=1);

use App\User\Profile\UpdateBioAction;
use Yiisoft\Router\Route;

return [
    Route::post('/api/user/bio')->action(UpdateBioAction::class),
];
