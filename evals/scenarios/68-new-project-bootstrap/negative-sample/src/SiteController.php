<?php

declare(strict_types=1);

namespace app\controllers;

use yii\web\Controller;

class SiteController extends Controller
{
    public function actionHealth(): array
    {
        return ['status' => \Yii::$app->id];
    }
}
