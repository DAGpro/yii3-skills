<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Domain\Post;
use App\Blog\Domain\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class PostListAction
{
    public function __construct(
        private PostRepositoryInterface $posts,
        private WebViewRenderer $view,
        private UrlGeneratorInterface $urls,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $posts = $this->posts->findAll();
        $postUrls = [];
        foreach ($posts as $post) {
            $postUrls[$post->getId()] = $this->urls->generate('post/view', ['id' => $post->getId()]);
        }

        return $this->view->render('post/list', [
            'posts' => $posts,
            'postUrls' => $postUrls,
            'postsUrl' => $this->urls->generate('post/index'),
            'featuredUrl' => $this->urls->generate('post/view', ['id' => 42]),
        ]);
    }
}
