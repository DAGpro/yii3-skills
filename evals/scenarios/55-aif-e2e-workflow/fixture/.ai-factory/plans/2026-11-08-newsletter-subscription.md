# Plan: Newsletter Subscription Feature

## Phase 1 Migration & Schema
- [ ] Task 1.1: Create `newsletter_subscribers` table migration in `migrations/`

## Phase 2 Domain Entity & Repository Interface
- [ ] Task 2.1: Domain aggregate `Subscriber` in `src/Newsletter/Domain/`
- [ ] Task 2.2: `SubscriberRepositoryInterface` in `src/Newsletter/Domain/`

## Phase 3 Repository Implementation
- [ ] Task 3.1: `SqlSubscriberRepository` in `src/Newsletter/Infrastructure/`

## Phase 4 Use Case Handler & Events
- [ ] Task 4.1: `SubscribeCommand` and `SubscribeHandler` in `src/Newsletter/Application/`
- [ ] Task 4.2: `SubscribedEvent` in `src/Newsletter/Application/Event/`

## Phase 5 Input DTO & Single-Action Handler
- [ ] Task 5.1: `SubscribeRequest` DTO in `src/Newsletter/Presentation/`
- [ ] Task 5.2: `SubscribeAction` in `src/Newsletter/Presentation/`

## Phase 6 Wiring & Tests
- [ ] Task 6.1: DI binding in `config/common/di/newsletter.php`
- [ ] Task 6.2: Route registration in `config/common/routes.php`
- [ ] Task 6.3: Integration tests in `tests/Newsletter/`

