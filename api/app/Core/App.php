<?php
declare(strict_types=1);

namespace NQ\Core;

/** The HTTP kernel: security headers, CORS, CSRF, auth, maintenance, routing, JSON output. */
final class App
{
    private const ALLOWED_HEADERS = 'Content-Type, Authorization, X-NQ-Client, X-NQ-Date';
    private const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

    public static function securityHeaders(string $csp = "default-src 'none'; frame-ancestors 'none'"): void
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        header('X-Frame-Options: DENY');
        header('Content-Security-Policy: ' . $csp);
        header('Cross-Origin-Resource-Policy: same-site');
        header('Strict-Transport-Security: max-age=31536000');
        header_remove('X-Powered-By');
    }

    public static function originAllowed(?string $origin): bool
    {
        if ($origin === null || $origin === '') {
            return false;
        }
        foreach ((array) Config::get('cors_origins', []) as $allowed) {
            if (is_string($allowed) && hash_equals(rtrim($allowed, '/'), rtrim($origin, '/'))) {
                return true;
            }
        }
        return false;
    }

    public static function run(): void
    {
        self::securityHeaders();
        header('Cache-Control: no-store');
        $req = null;
        try {
            $req = Request::fromGlobals();
            $origin = $req->header('origin');
            $allowed = self::originAllowed($origin);
            if ($allowed) {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Access-Control-Allow-Credentials: true');
                header('Access-Control-Expose-Headers: Retry-After, Content-Disposition');
            }
            header('Vary: Origin');

            if ($req->method === 'OPTIONS') {
                if (!$allowed) {
                    throw ApiError::forbidden('المصدر غير مسموح.');
                }
                header('Access-Control-Allow-Methods: ' . self::ALLOWED_METHODS);
                header('Access-Control-Allow-Headers: ' . self::ALLOWED_HEADERS);
                header('Access-Control-Max-Age: 600');
                http_response_code(204);
                return;
            }

            $isWrite = !in_array($req->method, ['GET', 'HEAD'], true);
            if ($isWrite) {
                if ($origin !== null && $origin !== '' && !$allowed) {
                    throw ApiError::forbidden('المصدر غير مسموح.');
                }
                $client = $req->header('x-nq-client');
                if ($client !== 'web' && $client !== 'app') {
                    throw ApiError::forbidden('الطلب مرفوض لأسباب أمنية (رأس X-NQ-Client مفقود).');
                }
            }

            $path = $req->path;
            if ($path === '/' || $path === '/v1') {
                self::send(200, ['ok' => true, 'data' => ['name' => 'Noor Al-Quran API', 'version' => 'v1']]);
                return;
            }
            if (!str_starts_with($path, '/v1/')) {
                throw ApiError::notFound('المسار غير موجود.');
            }
            $path = substr($path, 3);

            $router = new Router();
            (require dirname(__DIR__) . '/routes.php')($router);
            [$handler, $params] = $router->match($req->method, $path);
            $req->params = $params;

            Migrations::ensure();
            Auth::resolve($req);

            if (!self::maintenanceExempt($req->method, $path) && Settings::get('maintenance_mode') === true && !$req->isAdmin()) {
                throw ApiError::of(503, 'maintenance');
            }
            if ($isWrite) {
                RateLimit::hit('writes', RateLimit::subjects($req));
            }

            $result = $handler($req);
            self::emit($result);
        } catch (ApiError $e) {
            foreach ($e->headers as $k => $v) {
                header($k . ': ' . $v);
            }
            self::send($e->status, ['ok' => false, 'error' => array_merge(
                ['code' => $e->errCode, 'message' => $e->getMessage()],
                $e->extra
            )]);
        } catch (\Throwable $e) {
            self::logThrowable($e);
            self::send(500, ['ok' => false, 'error' => ['code' => 'server', 'message' => 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.']]);
        }
    }

    private static function maintenanceExempt(string $method, string $path): bool
    {
        return ($method === 'GET' && ($path === '/settings/public' || $path === '/health'))
            || str_starts_with($path, '/auth/')
            || str_starts_with($path, '/admin/');
    }

    private static function emit(mixed $result): void
    {
        if ($result instanceof Redirect) {
            header('Location: ' . $result->location, true, 302);
            http_response_code(302);
            return;
        }
        if ($result instanceof Reply) {
            foreach ($result->headers as $k => $v) {
                header($k . ': ' . $v);
            }
            self::send($result->status, ['ok' => true, 'data' => $result->data]);
            return;
        }
        self::send(200, ['ok' => true, 'data' => $result]);
    }

    /** @param array<string,mixed> $payload */
    public static function send(int $status, array $payload): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION);
        if ($json === false) {
            http_response_code(500);
            $json = '{"ok":false,"error":{"code":"server","message":"حدث خطأ غير متوقع."}}';
        }
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
            echo $json;
        }
    }

    public static function logThrowable(\Throwable $e): void
    {
        error_log(sprintf(
            '[nq] %s: %s in %s:%d | %s %s',
            get_class($e),
            $e->getMessage(),
            $e->getFile(),
            $e->getLine(),
            $_SERVER['REQUEST_METHOD'] ?? '-',
            (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH)
        ));
    }
}
