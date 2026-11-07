<?php

declare(strict_types=1);

namespace App\User\Validation;

use Yiisoft\Validator\Exception\UnexpectedRuleException;
use Yiisoft\Validator\Result;
use Yiisoft\Validator\RuleHandlerInterface;
use Yiisoft\Validator\RuleInterface;
use Yiisoft\Validator\ValidationContext;

final readonly class ReservedUsernameHandler implements RuleHandlerInterface
{
    public function validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result
    {
        if (!$rule instanceof ReservedUsername) {
            throw new UnexpectedRuleException(ReservedUsername::class, $rule);
        }

        $result = new Result();
        if (!is_string($value)) {
            return $result;
        }

        if (in_array($value, $rule->usernames, true)) {
            $result->addError($rule->message, [
                'property' => $context->getTranslatedProperty(),
                'Property' => $context->getCapitalizedTranslatedProperty(),
            ]);
        }

        return $result;
    }
}
