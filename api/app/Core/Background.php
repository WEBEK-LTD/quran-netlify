<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Work done after the response: drain a few queued pushes and, at most every 30 s, the community housekeeping
 * (auto-close rooms without speakers, 10-minute reminders, expired suspensions, old queue rows).
 * With PHP-FPM / LiteSpeed the response is finished first (fastcgi_finish_request / litespeed_finish_request), so the
 * user never waits; elsewhere (php -S, CGI) it runs before the connection closes. The cron worker
 * (tools/push-worker.php) does the same work every minute, so nothing depends on traffic.
 */
final class Background
{
    public const TICK_EVERY = 30;
    public static bool $pushPending = false;
    private static bool $registered = false;

    public static function register(): void
    {
        if (self::$registered) {
            return;
        }
        self::$registered = true;
        register_shutdown_function([self::class, 'run']);
    }

    private static function markerFile(): string
    {
        return Config::storageDir('cache') . '/housekeeping.at';
    }

    /** Whether a housekeeping run is due (and claim it). */
    public static function claimTick(): bool
    {
        $f = self::markerFile();
        clearstatcache(true, $f);
        $m = @filemtime($f);
        if ($m !== false && $m > time() - self::TICK_EVERY) {
            return false;
        }
        @touch($f);
        return true;
    }

    public static function run(): void
    {
        try {
            $tick = self::claimTick();
            if (!self::$pushPending && !$tick) {
                return;
            }
            ignore_user_abort(true);
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            } elseif (function_exists('litespeed_finish_request')) {
                litespeed_finish_request();
            }
            if ($tick) {
                Rooms::tick();
            }
            Push::process(10, 4.0);
        } catch (\Throwable $e) {
            App::logThrowable($e);
        }
    }
}
