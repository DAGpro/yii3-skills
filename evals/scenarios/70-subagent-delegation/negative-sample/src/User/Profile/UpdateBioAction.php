<?php

namespace App\User\Profile;

class UpdateBioAction
{
    public function run()
    {
        $sql = "UPDATE user SET bio = 'test' WHERE id = 1";
        \Yii::$app->db->createCommand($sql)->execute();
        echo "done";
    }
}
