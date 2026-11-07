<?php

declare(strict_types=1);

namespace App\Web\Contact;

final readonly class ContactService
{
    public function store(string $email, string $message): void
    {
        // persistence omitted for the fixture
    }
}
