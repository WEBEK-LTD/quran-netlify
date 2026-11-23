<?php
declare(strict_types=1);

namespace NQ\Core;

/** A successful JSON reply with a custom status and/or headers. */
final class Reply
{
    /** @param array<string,string> $headers */
    public function __construct(
        public readonly mixed $data,
        public readonly int $status = 200,
        public readonly array $headers = []
    ) {
    }

    public static function created(mixed $data): self
    {
        return new self($data, 201);
    }

    /** An empty JSON object `{}`. */
    public static function empty(): \stdClass
    {
        return new \stdClass();
    }
}
