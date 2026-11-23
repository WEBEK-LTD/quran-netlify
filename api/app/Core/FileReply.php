<?php
declare(strict_types=1);

namespace NQ\Core;

/** A non-JSON reply that streams a file from disk (used for profile photos). */
final class FileReply
{
    /** @param array<string,string> $headers */
    public function __construct(
        public readonly string $path,
        public readonly string $contentType,
        public readonly array $headers = []
    ) {
    }
}
