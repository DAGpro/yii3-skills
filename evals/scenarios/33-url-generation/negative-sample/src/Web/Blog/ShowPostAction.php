<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\UpdatePostService;
use App\Blog\Domain\PostRepositoryInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ShowPostAction
{
    public function __construct(
        private PostRepositoryInterface $posts,
        private UpdatePostService $updates,
        private WebViewRenderer $view,
        private ResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request, CurrentRoute $route): ResponseInterface
    {
        $post = $this->posts->find((int) $route->getArgument('id'));
        if ($post === null) {
            return $this->responses->createResponse(Status::NOT_FOUND);
        }

        if ($request->getMethod() === 'POST') {
            $data = (array) $request->getParsedBody();
            $this->updates->update($post->getId(), (string) ($data['title'] ?? $post->getTitle()));
            $id = $post->getId();
            return $this->responses
                ->createResponse(Status::FOUND)
                ->withHeader(Header::LOCATION, '/posts/' . $id);
        }

        return $this->view->render('post/show', ['post' => $post]);
    }
}
