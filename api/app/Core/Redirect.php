<?php
declare(strict_types=1);

namespace NQ\Core;

/** A 302 redirect (used by the Google OAuth flow). */
final class Redirect
{
    public function __construct(public readonly string $location)
    {
    }
}
