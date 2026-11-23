<?php
declare(strict_types=1);

/**
 * Shared bootstrap for index.php and install.php.
 * $NQ_BASE is the directory that holds app/, schema.sql and config.php.
 */

if (PHP_VERSION_ID < 80200) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'PHP 8.2+ required';
    exit;
}

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

(static function (): void {
    $logDir = dirname(__DIR__) . '/storage/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0700, true);
    }
    if (is_dir($logDir) && is_writable($logDir)) {
        ini_set('error_log', $logDir . '/php-error.log');
    }
})();

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'NQ\\')) {
        return;
    }
    $rel = str_replace('\\', '/', substr($class, 3));
    $file = __DIR__ . '/' . $rel . '.php';
    if (is_file($file)) {
        require $file;
    }
});

/** Absolute path of the directory that holds app/ (config.php and schema.sql live here). */
function nq_base_dir(): string
{
    return dirname(__DIR__);
}

function nq_config_path(): string
{
    return nq_base_dir() . '/config.php';
}
