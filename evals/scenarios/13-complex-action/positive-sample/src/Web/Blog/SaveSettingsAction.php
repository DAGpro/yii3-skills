<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\SaveSettingsInput;
use App\Blog\Application\SettingsService;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class SaveSettingsAction
{
    public function __construct(
        private SettingsService $settings,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(SaveSettingsInput $input): ResponseInterface
    {
        $this->settings->save($input->title, $input->postsPerPage, $input->description);
        return $this->responses->createResponse(['status' => 'saved']);
    }
}
