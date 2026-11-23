<?php
declare(strict_types=1);

namespace NQ\Core;

final class Request
{
    public const MAX_BODY = 65536;

    /**
     * The largest request body a route accepts (checked from Content-Length before routing).
     * Everything is JSON capped at MAX_BODY except the profile-photo upload (multipart).
     */
    public static function bodyLimit(string $method, string $path): int
    {
        return $method === 'POST' && self::isPhotoUpload($path) ? Avatar::MAX_REQUEST : self::MAX_BODY;
    }

    /** Multipart photo uploads: the profile photo and a community group's photo. */
    public static function isPhotoUpload(string $path): bool
    {
        return $path === '/me/avatar' || preg_match('#^/community/groups/\d{1,9}/photo$#', $path) === 1;
    }

    public string $method;
    public string $path;
    /** @var array<string,mixed> */
    public array $query;
    /** @var array<string,string> lower-cased header names */
    public array $headers;
    public string $ip;
    /** @var array<string,mixed>|null the signed-in user row */
    public ?array $user = null;
    public ?int $sessionId = null;
    public ?string $authVia = null; // 'cookie' | 'bearer'
    /** @var array<string,string> route params */
    public array $params = [];
    /** @var array<string,mixed>|null */
    private ?array $body = null;

    public static function fromGlobals(): self
    {
        $r = new self();
        $r->method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        $path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?? '/');
        $path = '/' . trim(rawurldecode($path), '/');
        $r->path = $path;
        $r->query = $_GET;
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (is_string($v) && str_starts_with($k, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
            }
        }
        foreach (['CONTENT_TYPE' => 'content-type', 'CONTENT_LENGTH' => 'content-length'] as $k => $h) {
            if (isset($_SERVER[$k])) {
                $headers[$h] = (string) $_SERVER[$k];
            }
        }
        if (!isset($headers['authorization'])) {
            $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
            if (!$auth && function_exists('getallheaders')) {
                foreach ((array) getallheaders() as $k => $v) {
                    if (strtolower((string) $k) === 'authorization') {
                        $auth = $v;
                    }
                }
            }
            if (is_string($auth) && $auth !== '') {
                $headers['authorization'] = $auth;
            }
        }
        $r->headers = $headers;
        $r->ip = self::clientIp($headers);
        return $r;
    }

    /** @param array<string,string> $headers */
    private static function clientIp(array $headers): string
    {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        if (Config::get('trust_proxy') === true) {
            $fwd = $headers['cf-connecting-ip'] ?? $headers['x-forwarded-for'] ?? '';
            $first = trim(explode(',', $fwd)[0]);
            if ($first !== '' && filter_var($first, FILTER_VALIDATE_IP)) {
                $ip = $first;
            }
        }
        return $ip;
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    public function cookie(string $name): ?string
    {
        $v = $_COOKIE[$name] ?? null;
        return is_string($v) ? $v : null;
    }

    public function q(string $key, ?string $default = null): ?string
    {
        $v = $this->query[$key] ?? null;
        return is_string($v) ? $v : $default;
    }

    public function param(string $key): string
    {
        return $this->params[$key] ?? '';
    }

    public function intParam(string $key): int
    {
        $v = $this->params[$key] ?? '';
        if (!preg_match('/^\d{1,9}$/', $v)) {
            throw ApiError::notFound();
        }
        return (int) $v;
    }

    /** One uploaded file from a multipart/form-data body (PHP has already parsed it). @return array<string,mixed>|null */
    public function file(string $field): ?array
    {
        $f = $_FILES[$field] ?? null;
        return is_array($f) ? $f : null;
    }

    private ?string $rawBody = null;

    /** The raw request body (≤ 64 KB), e.g. to verify a webhook signature. */
    public function raw(): string
    {
        if ($this->rawBody !== null) {
            return $this->rawBody;
        }
        $len = (int) ($this->headers['content-length'] ?? 0);
        if ($len > self::MAX_BODY) {
            throw new ApiError(413, 'payload_too_large');
        }
        $raw = (string) file_get_contents('php://input', false, null, 0, self::MAX_BODY + 1);
        if (strlen($raw) > self::MAX_BODY) {
            throw new ApiError(413, 'payload_too_large');
        }
        return $this->rawBody = $raw;
    }

    /** @return array<string,mixed> the decoded JSON object body (empty array if none) */
    public function body(): array
    {
        if ($this->body !== null) {
            return $this->body;
        }
        $raw = $this->raw();
        if (trim($raw) === '') {
            return $this->body = [];
        }
        try {
            $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (\JsonException) {
            throw ApiError::badRequest('صيغة البيانات غير صحيحة (JSON).');
        }
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            throw ApiError::badRequest('يجب أن تكون البيانات كائن JSON.');
        }
        return $this->body = $data;
    }

    public function userId(): int
    {
        if ($this->user === null) {
            throw ApiError::unauthenticated();
        }
        return (int) $this->user['id'];
    }

    public function isAdmin(): bool
    {
        return $this->user !== null && (int) $this->user['is_admin'] === 1;
    }

    public function userAgent(): string
    {
        return mb_substr((string) ($this->headers['user-agent'] ?? ''), 0, 255);
    }
}
