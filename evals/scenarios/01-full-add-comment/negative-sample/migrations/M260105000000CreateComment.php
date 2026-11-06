<?php

namespace App\Migration;

final class M260105000000CreateComment
{
    public function up($b): void
    {
        $b->createTable('comment', ['id' => 'pk']);
    }

    public function down($b): void
    {
    }
}
