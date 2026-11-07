<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure\Cycle;

use App\Blog\Domain\Tag;
use App\Blog\Domain\TagRepositoryInterface;
use Cycle\ORM\EntityManagerInterface;

final readonly class TagRepository implements TagRepositoryInterface
{
    public function __construct(
        private EntityManagerInterface $entityManager,
    ) {}

    public function create(string $name): Tag
    {
        $tag = new Tag($name);

        $this->entityManager->persist($tag);
        $this->entityManager->flush();

        return $tag;
    }
}
