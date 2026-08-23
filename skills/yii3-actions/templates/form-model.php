<?php

declare(strict_types=1);

namespace {Namespace}\{Feature}\Form;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Email;

final class {Entity}Form extends FormModel
{
    #[Required]
    #[Length(min: 2, max: 100)]
    private ?string $name = null;

    #[Required]
    #[Email]
    private ?string $email = null;

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(?string $value): void
    {
        $this->name = $value;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setEmail(?string $value): void
    {
        $this->email = $value;
    }
}
