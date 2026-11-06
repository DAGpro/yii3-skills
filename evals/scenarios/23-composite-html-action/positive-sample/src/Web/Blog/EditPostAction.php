<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\UpdatePostService;
use App\Blog\Domain\PostRepositoryInterface;
use App\Blog\Infrastructure\CoverImageStorage;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class EditPostAction
{
    public function __construct(
        private PostRepositoryInterface $posts,
        private UpdatePostService $updates,
        private CoverImageStorage $covers,
        private FormHydrator $formHydrator,
        private WebViewRenderer $view,
        private ResponseFactoryInterface $responses,
        private UrlGeneratorInterface $urls,
        private FlashInterface $flash,
    ) {}

    public function __invoke(ServerRequestInterface $request, CurrentRoute $route): ResponseInterface
    {
        $post = $this->posts->find((int) $route->getArgument('id'));
        if ($post === null) {
            return $this->responses->createResponse(Status::NOT_FOUND);
        }

        $form = new EditPostForm();
        $form->title = $post->getTitle();
        $form->content = $post->getContent();

        if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
            $coverPath = null;
            $cover = $request->getUploadedFiles()['cover'] ?? null;
            if ($cover instanceof UploadedFileInterface && $cover->getError() === UPLOAD_ERR_OK) {
                $coverPath = $this->covers->save($cover);
            }

            $this->updates->update($post->getId(), $form->title, $form->content, $coverPath);
            $this->flash->add('success', 'Post updated.');

            return $this->responses
                ->createResponse(Status::SEE_OTHER)
                ->withHeader(Header::LOCATION, $this->urls->generate('post/edit', ['id' => $post->getId()]));
        }

        return $this->view->render('post/edit', [
            'form' => $form,
            'pageTitle' => 'Edit post #' . $post->getId(),
        ]);
    }
}
