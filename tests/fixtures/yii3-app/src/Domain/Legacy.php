<?php
namespace App\Domain;

use yii\base\Model;

final class Legacy { public function f() { return Yii::$app->db; } }
