<?php

declare(strict_types=1);

namespace App\Web\Auth;

use App\User\SignupService;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Status;

final readonly class SignupAction
{
    public function __construct(
        private FormHydrator $formHydrator,
        private SignupService $signups,
        private ResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new SignupForm();
        if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
            $this->signups->register($form->username, $form->email, $form->password);
            return $this->responses->createResponse(Status::OK);
        }

        return $this->responses->createResponse(Status::UNPROCESSABLE_ENTITY);
    }
}
