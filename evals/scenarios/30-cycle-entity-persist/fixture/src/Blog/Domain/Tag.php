<?php

declare(strict_types=1);

namespace App\Blog\Domain;

use Cycle\Annotated\Annotation\Column;
use Cycle\Annotated\Annotation\Entity;

#[Entity(table: 'tags')]
class Tag
{
    #[Column(type: 'primary')]
    private ?int $id = null;

    #[Column(type: 'string(64)', unique: true)]
    private string $name;

    public function __construct(string $name)
    {
        $this->name = $name;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }
}
