<?php

declare(strict_types=1);

use Yiisoft\Access\AccessCheckerInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Rbac\AssignmentsStorageInterface;
use Yiisoft\Rbac\ItemsStorageInterface;
use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\ManagerInterface;
use Yiisoft\Rbac\Php\AssignmentsStorage;
use Yiisoft\Rbac\Php\ItemsStorage;

/** @var array $params */

$rbacDirectory = dirname(__DIR__, 2) . '/resources/rbac';

return [
    ItemsStorageInterface::class => [
        'class' => ItemsStorage::class,
        '__construct()' => [
            'filePath' => $rbacDirectory . '/items.php',
        ],
    ],
    AssignmentsStorageInterface::class => [
        'class' => AssignmentsStorage::class,
        '__construct()' => [
            'filePath' => $rbacDirectory . '/assignments.php',
        ],
    ],
    ManagerInterface::class => [
        'class' => Manager::class,
        '__construct()' => [
            'itemsStorage' => Reference::to(ItemsStorageInterface::class),
            'assignmentsStorage' => Reference::to(AssignmentsStorageInterface::class),
        ],
    ],
    AccessCheckerInterface::class => Reference::to(ManagerInterface::class),
];
