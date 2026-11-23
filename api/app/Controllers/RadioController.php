<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\Radio;
use NQ\Core\Reply;
use NQ\Core\Request;

/** Public data for the «الإذاعة» page: the checked radio catalogue. */
final class RadioController
{
    /**
     * GET /radio → {checked_at, stale, stations:[{id, name_ar, name_en, country, category, featured, source, url, hls, status, bitrate}]}.
     * The stream check runs at most every 6 h. When old results exist and the server can end the response early
     * (PHP-FPM / LiteSpeed), they are served at once and the check runs after the response; otherwise (first run,
     * php -S, CGI) the request waits for the check (≈ 10–30 s, once).
     */
    public static function index(Request $r): Reply
    {
        $stations = Radio::stations();
        $status = Radio::readStatus();
        if (Radio::needsCheck($stations, $status)) {
            $finish = function_exists('fastcgi_finish_request') ? 'fastcgi_finish_request'
                : (function_exists('litespeed_finish_request') ? 'litespeed_finish_request' : null);
            if ($status !== null && $finish !== null) {
                register_shutdown_function(static function () use ($finish, $stations): void {
                    ignore_user_abort(true);
                    $finish();
                    try {
                        Radio::refreshStatus($stations);
                    } catch (\Throwable $e) {
                        error_log('radio check failed: ' . $e->getMessage());
                    }
                });
            } else {
                $status = Radio::refreshStatus($stations) ?? Radio::readStatus();
            }
        }
        return new Reply(Radio::shape($stations, $status), 200, ['Cache-Control' => 'public, max-age=600']);
    }
}
