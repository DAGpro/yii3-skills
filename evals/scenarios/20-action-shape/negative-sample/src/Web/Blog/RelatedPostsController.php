<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\RelatedPostsService;

class RelatedPostsController
{
    public function __construct(private RelatedPostsService $relatedPosts) {}

    public function actionRelated(): array
    {
        $id = (int) ($_GET['id'] ?? 0);
        $related = $this->relatedPosts->findRelated($id);
        echo json_encode(['data' => $related]);
        return ['data' => $related];
    }
}
