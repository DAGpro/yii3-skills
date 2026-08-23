<?php

declare(strict_types=1);

namespace {Namespace}\Admin\{Feature}\Action;

use {Namespace}\{Feature}\Form\{Entity}Form;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Status;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class Create{Entity}Action
{
    public function __construct(
        private FormHydrator $formHydrator,
        private WebViewRenderer $viewRenderer,
        private ResponseFactoryInterface $responseFactory,
        private UrlGeneratorInterface $urlGenerator,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $this->logger->debug('Create{Entity}Action invoked');

        $form = new {Entity}Form();
        $errors = [];

        if ($request->getMethod() === 'POST') {
            if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
                try {
                    // Save entity

                    $this->logger->debug('{Entity} created');

                    return $this->responseFactory
                        ->createResponse(Status::SEE_OTHER)
                        ->withHeader('Location', $this->urlGenerator->generate('admin.{entities}'));
                } catch (\RuntimeException $e) {
                    $this->logger->warning('{Entity} create failed: {error}', ['error' => $e->getMessage()]);
                }
            } else {
                $errors = $form->getValidationResult()->getErrorMessagesIndexedByProperty();
            }
        }

        return $this->viewRenderer
            ->withLayout('@views/layouts/admin.php')
            ->render(__DIR__ . '/create', [
                'form' => $form,
                'errors' => $errors,
                'urlGenerator' => $this->urlGenerator,
            ]);
    }
}
