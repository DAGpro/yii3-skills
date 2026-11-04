<?php

declare(strict_types=1);

namespace App\Tests;

use App\Application\CreatePostCommand;
use App\Application\CreatePostHandler;
use App\Domain\PostCreated;
use App\Domain\PostStatus;
use App\Tests\Support\FakeConnection;
use App\Tests\Support\SpyPostRepository;
use DomainException;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;

/**
 * Unit tests for the "create post" use case handler.
 *
 * Proven invariants:
 * 1. Strict order: save (inside the transaction) -> commit -> dispatch.
 * 2. On transaction rollback the domain event is NOT dispatched
 *    (no ghost notifications).
 * 3. When the domain pre-check fails, nothing is written and nothing
 *    is dispatched.
 *
 * Requires `yiisoft/test-support` (`require-dev`) for `SimpleEventDispatcher`.
 */
final class CreatePostHandlerTest extends TestCase
{
    public function testSaveHappensInsideTransactionAndDispatchStrictlyAfterCommit(): void
    {
        $connection = new FakeConnection();
        $posts = new SpyPostRepository();
        $dispatcher = new SimpleEventDispatcher();
        $handler = new CreatePostHandler($connection, $posts, $dispatcher);

        $post = $handler->handle(new CreatePostCommand(
            title: 'Test post',
            content: 'Long enough post body.',
            status: PostStatus::Draft,
        ));

        // save() ran inside the transaction closure; commit happened before dispatch.
        $this->assertSame(
            ['transaction.begin', 'transaction.commit'],
            $connection->getTimeline(),
        );
        $this->assertCount(1, $posts->getSaved());
        $this->assertSame(1, $post->getId());
        $this->assertSame([PostCreated::class], $dispatcher->getEventClasses());

        $event = $dispatcher->getEvents()[0];
        $this->assertInstanceOf(PostCreated::class, $event);
        $this->assertSame('Test post', $event->title);
        $this->assertSame(PostStatus::Draft, $event->status);
    }

    public function testRollbackPreventsEventDispatch(): void
    {
        $connection = new FakeConnection();
        $posts = new SpyPostRepository();
        $posts->failNextSave();
        $dispatcher = new SimpleEventDispatcher();
        $handler = new CreatePostHandler($connection, $posts, $dispatcher);

        try {
            $handler->handle(new CreatePostCommand(
                title: 'Doomed post',
                content: 'This write will roll back.',
                status: PostStatus::Draft,
            ));
            $this->fail('The simulated storage failure must propagate out of transaction().');
        } catch (RuntimeException) {
            // Expected: the connection rolled back and re-threw.
        }

        $this->assertSame(
            ['transaction.begin', 'transaction.rollback'],
            $connection->getTimeline(),
        );
        $this->assertSame([], $dispatcher->getEvents(), 'No event may be dispatched after a rollback.');
    }

    public function testFailedDomainCheckWritesNothing(): void
    {
        $connection = new FakeConnection();
        $posts = new SpyPostRepository();
        $posts->seedExistingTitle('Duplicate post');
        $dispatcher = new SimpleEventDispatcher();
        $handler = new CreatePostHandler($connection, $posts, $dispatcher);

        try {
            $handler->handle(new CreatePostCommand(
                title: 'Duplicate post',
                content: 'Must never reach storage.',
                status: PostStatus::Draft,
            ));
            $this->fail('A duplicate title must be rejected with a domain exception.');
        } catch (DomainException) {
            // Expected: the uniqueness pre-check rejected the command.
        }

        $this->assertSame([], $posts->getSaved(), 'Nothing must be persisted when the domain check fails.');
        $this->assertSame([], $connection->getTimeline(), 'The transaction must not even be opened.');
        $this->assertSame([], $dispatcher->getEvents(), 'No event may be dispatched for a rejected command.');
    }

    public function testReleaseEventsAreDrainedExactlyOnce(): void
    {
        $connection = new FakeConnection();
        $posts = new SpyPostRepository();
        $dispatcher = new SimpleEventDispatcher();
        $handler = new CreatePostHandler($connection, $posts, $dispatcher);

        $post = $handler->handle(new CreatePostCommand(
            title: 'Once-only post',
            content: 'Events must not leak across handle() calls.',
            status: PostStatus::Draft,
        ));

        $this->assertSame(1, $post->getId());
        $this->assertCount(1, $dispatcher->getEvents());

        // Draining again (e.g. by a second use case touching the same instance) yields nothing.
        $this->assertSame([], $post->releaseEvents());
        $this->assertSame([PostCreated::class], $dispatcher->getEventClasses());
    }
}
