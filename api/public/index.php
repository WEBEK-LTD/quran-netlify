<?php
declare(strict_types=1);

// Noor Al-Quran API — front controller. Everything secret lives outside the web root.

// `php -S` dev server: let real files (install.php) be served directly.
if (PHP_SAPI === 'cli-server') {
    $f = __DIR__ . (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    if ($f !== __FILE__ && is_file($f) && basename($f)[0] !== '.') {
        return false;
    }
}

/** Find the app/ directory: repo layout (api/public → api/app) or production (~/public_html/<sub> → ~/nuralquran-api/app). */
$nqApp = null;
foreach ([dirname(__DIR__) . '/app', dirname(__DIR__, 2) . '/nuralquran-api/app'] as $nqCandidate) {
    if (is_file($nqCandidate . '/bootstrap.php')) {
        $nqApp = $nqCandidate;
        break;
    }
}
if ($nqApp === null) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"ok":false,"error":{"code":"server","message":"لم يتم العثور على ملفات التطبيق (مجلد app). ارفع مجلد nuralquran-api خارج public_html كما في دليل التثبيت."}}';
    exit;
}

require $nqApp . '/bootstrap.php';

if (!is_file(nq_config_path())) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo '{"ok":false,"error":{"code":"server","message":"الخادم غير مُثبّت بعد. افتح install.php لإكمال التثبيت."}}';
    exit;
}

NQ\Core\Config::init(nq_base_dir(), (array) require nq_config_path());
NQ\Core\App::run();
