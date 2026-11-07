<?php

namespace app\controllers;

use Yii;
use yii\web\Controller;
use yii\web\Response;

class SiteController extends Controller
{
    public function actionIndex(): string
    {
        return $this->render('index', ['appName' => Yii::$app->name]);
    }

    public function actionHealth(): array
    {
        Yii::$app->response->format = Response::FORMAT_JSON;

        return ['status' => 'ok'];
    }
}
