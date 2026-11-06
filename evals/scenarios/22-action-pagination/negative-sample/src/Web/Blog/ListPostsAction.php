<?php

declare(strict_types=1);

namespace App\Web\Blog;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class ListPostsAction
{
    public function __construct(
        private ConnectionInterface $db,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $posts = (new Query($this->db))
            ->from('{{%post}}')
            ->where(['status' => 'published'])
            ->orderBy(['created_at' => SORT_DESC])
            ->all();

        return $this->responses->createResponse(['data' => $posts]);
    }
}
