<?php

namespace App\Web\Blog;

use Yii;

final class AddCommentAction
{
    public function __construct(private $db, private $events) {}

    public function __invoke($request, $route)
    {
        $this->db->transaction(function () use ($request) {
            $this->db->createCommand()->insert('comment', ['body' => $_POST['body']])->execute();
            $this->events->dispatch(new \stdClass());
        });
        Yii::$app->session->setFlash('ok');
        return 'created';
    }
}
