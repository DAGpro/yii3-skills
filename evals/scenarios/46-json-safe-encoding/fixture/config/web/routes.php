<?php

declare(strict_types=1);

use App\Reporting\Web\Api\ExportAction;
use App\Reporting\Web\Page\ReportAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/api/export/{userId:\d+}', action: ExportAction::class),
    new Get('/report/{userId:\d+}', action: ReportAction::class),
];
