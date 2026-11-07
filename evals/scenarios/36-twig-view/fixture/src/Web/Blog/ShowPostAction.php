<?php

declare(strict_types=1);

namespace App\Web\Blog;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ShowPostAction
{
    private const POSTS = [
        1 => [
            'title' => 'Welcome to the new blog',
            'body' => 'Our team finally moved to the new platform. Expect regular updates here.',
        ],
        2 => [
            'title' => 'Rendering pages the modern way',
            'body' => 'A quick tour of the page rendering pipeline and layouts.',
        ],
        3 => [
            'title' => 'Roadmap for next quarter',
            'body' => 'What we are planning to ship over the next three months.',
        ],
    ];

    public function __construct(
        private WebViewRenderer $view,
        private ResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request, CurrentRoute $route): ResponseInterface
    {
        $id = (int) $route->getArgument('id');
        $post = self::POSTS[$id] ?? null;
        if ($post === null) {
            return $this->responses->createResponse(Status::NOT_FOUND);
        }

        return $this->view->render('post/show', [
            'pageTitle' => 'Post: ' . $post['title'],
            'post' => $post,
            'latestPosts' => $this->latestPosts(),
        ]);
    }

    private function latestPosts(): array
    {
        $latest = [];
        foreach (self::POSTS as $postId => $entry) {
            $latest[] = ['id' => $postId, 'title' => $entry['title']];
        }
        return $latest;
    }
}
