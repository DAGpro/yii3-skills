<?php

declare(strict_types=1);

return [
    [
        'name' => 'userAdmin',
        'type' => 'permission',
        'description' => 'Manage user accounts',
    ],
    [
        'name' => 'admin',
        'type' => 'role',
        'children' => ['userAdmin'],
    ],
    [
        'name' => 'editor',
        'type' => 'role',
        'children' => [],
    ],
];
