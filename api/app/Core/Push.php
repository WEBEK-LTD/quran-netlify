<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Notifications: an in-app list (`notifications`) plus push to the user's devices through a queue (`push_queue`).
 *
 * notify()/notifyMany() store the notification and enqueue one row per registered device (skipping types the user
 * muted). The queue is drained in small batches after the response (Background) and by the cron worker
 * (tools/push-worker.php). Senders:
 *   FCM HTTP v1 — service-account JSON (admin Integrations `fcm_service_account`): an RS256 assertion is exchanged at
 *                 the token_uri for an OAuth access token (cached ~55 min, encrypted), then
 *                 POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send.
 *   APNs        — token auth: ES256 JWT {iss: team id, iat} with kid = key id, signed with the .p8 key (cached 50 min),
 *                 POST https://api.push.apple.com/3/device/{token} over HTTP/2, apns-topic = bundle id.
 * Dead tokens (FCM UNREGISTERED/404, APNs 410/BadDeviceToken) remove the device; 429/5xx/network errors retry with
 * back-off (30 s · 2^n, 5 attempts).
 */
final class Push
{
    /** Types a user can mute (suspension notices cannot be muted). */
    public const TYPES = [
        'room_opened', 'room_scheduled', 'group_room', 'reminder_soon', 'reminder_started', 'reminder_changed',
        'reminder_cancelled', 'speak_invite', 'friend_request', 'friend_accept', 'dm', 'join_request', 'suspension',
    ];
    public const MUTABLE = [
        'room_opened', 'room_scheduled', 'group_room', 'reminder_soon', 'reminder_started', 'reminder_changed',
        'reminder_cancelled', 'speak_invite', 'friend_request', 'friend_accept', 'dm', 'join_request',
    ];
    private const MAX_ATTEMPTS = 5;

    /** @param array<string,scalar|null> $data */
    public static function notify(int $userId, string $type, string $title, string $body, array $data = [], bool $store = true, ?string $collapse = null): void
    {
        self::notifyMany([$userId], $type, $title, $body, $data, $store, $collapse);
    }

    /**
     * @param list<int> $userIds
     * @param array<string,scalar|null> $data
     */
    public static function notifyMany(array $userIds, string $type, string $title, string $body, array $data = [], bool $store = true, ?string $collapse = null): void
    {
        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds), static fn (int $id): bool => $id > 0)));
        if ($userIds === []) {
            return;
        }
        $title = mb_substr($title, 0, 150);
        $body = mb_substr($body, 0, 500);
        $dataJson = (string) json_encode($data === [] ? new \stdClass() : $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $payload = (string) json_encode(['type' => $type, 'title' => $title, 'body' => $body, 'data' => $data, 'collapse' => $collapse], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $now = Db::now();
        $queued = 0;
        foreach (array_chunk($userIds, 300) as $chunk) {
            if ($store) {
                $rows = [];
                $params = [];
                foreach ($chunk as $uid) {
                    $rows[] = '(?, ?, ?, ?, ?, ?)';
                    array_push($params, $uid, $type, $title, $body, $dataJson, $now);
                }
                Db::exec('INSERT INTO notifications (user_id, type, title, body, data, created_at) VALUES ' . implode(', ', $rows), $params);
            }
            $in = implode(',', array_fill(0, count($chunk), '?'));
            $mutable = in_array($type, self::MUTABLE, true);
            $queued += Db::exec(
                "INSERT INTO push_queue (device_id, payload, status, attempts, next_attempt_at, created_at)
                 SELECT d.id, ?, 'pending', 0, ?, ? FROM devices d LEFT JOIN community_profiles cp ON cp.user_id = d.user_id
                 WHERE d.user_id IN ({$in})" . ($mutable ? ' AND (cp.user_id IS NULL OR FIND_IN_SET(?, cp.muted_types) = 0)' : ''),
                array_merge([$payload, $now, $now], $chunk, $mutable ? [$type] : [])
            );
        }
        if ($queued > 0) {
            Background::$pushPending = true;
        }
    }

    /**
     * Send up to $limit queued pushes within ~$budget seconds. Returns counts.
     * @return array{sent:int, failed:int, retry:int, dropped:int}
     */
    public static function process(int $limit = 10, float $budget = 4.0): array
    {
        $stats = ['sent' => 0, 'failed' => 0, 'retry' => 0, 'dropped' => 0];
        $start = microtime(true);
        $claim = bin2hex(random_bytes(8));
        $now = Db::now();
        // stuck claims (a worker died mid-batch) go back to the queue
        Db::exec("UPDATE push_queue SET status = 'pending', claim = NULL WHERE status = 'sending' AND claimed_at < ?", [Db::now(-300)]);
        $n = Db::exec(
            "UPDATE push_queue SET status = 'sending', claim = ?, claimed_at = ? WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id LIMIT " . max(1, min($limit, 500)),
            [$claim, $now, $now]
        );
        if ($n === 0) {
            return $stats;
        }
        $rows = Db::all(
            'SELECT q.id, q.payload, q.attempts, d.id AS device_id, d.provider, d.token FROM push_queue q JOIN devices d ON d.id = q.device_id WHERE q.claim = ? ORDER BY q.id',
            [$claim]
        );
        foreach ($rows as $row) {
            if (microtime(true) - $start > $budget) {
                Db::exec("UPDATE push_queue SET status = 'pending', claim = NULL WHERE id = ?", [(int) $row['id']]);
                continue;
            }
            $p = json_decode((string) $row['payload'], true);
            $p = is_array($p) ? $p : [];
            try {
                $res = $row['provider'] === 'apns' ? self::sendApns((string) $row['token'], $p) : self::sendFcm((string) $row['token'], $p);
            } catch (\Throwable $e) {
                App::logThrowable($e);
                $res = ['result' => 'fail', 'error' => 'exception: ' . $e->getMessage()];
            }
            $id = (int) $row['id'];
            $err = mb_substr((string) ($res['error'] ?? ''), 0, 255);
            switch ($res['result']) {
                case 'ok':
                    Db::exec("UPDATE push_queue SET status = 'sent', sent_at = ?, claim = NULL, last_error = NULL WHERE id = ?", [Db::now(), $id]);
                    $stats['sent']++;
                    break;
                case 'drop':
                    Db::exec('DELETE FROM devices WHERE id = ?', [(int) $row['device_id']]); // cascades its queue rows
                    $stats['dropped']++;
                    break;
                case 'retry':
                    $attempts = (int) $row['attempts'] + 1;
                    if ($attempts >= self::MAX_ATTEMPTS) {
                        Db::exec("UPDATE push_queue SET status = 'failed', attempts = ?, claim = NULL, last_error = ? WHERE id = ?", [$attempts, $err, $id]);
                        $stats['failed']++;
                    } else {
                        Db::exec(
                            "UPDATE push_queue SET status = 'pending', attempts = ?, claim = NULL, next_attempt_at = ?, last_error = ? WHERE id = ?",
                            [$attempts, Db::now(30 * (2 ** $attempts)), $err, $id]
                        );
                        $stats['retry']++;
                    }
                    break;
                default:
                    Db::exec("UPDATE push_queue SET status = 'failed', attempts = attempts + 1, claim = NULL, last_error = ? WHERE id = ?", [$err, $id]);
                    $stats['failed']++;
            }
        }
        return $stats;
    }

    /** @return array<string,mixed>|null the parsed service account */
    public static function fcmServiceAccount(): ?array
    {
        $sa = json_decode(Integrations::get('fcm_service_account'), true);
        if (!is_array($sa) || empty($sa['client_email']) || empty($sa['private_key']) || empty($sa['project_id'])) {
            return null;
        }
        return $sa;
    }

    private static function cacheFile(string $name): string
    {
        return Config::storageDir('cache/push') . '/' . $name;
    }

    /** @return array<string,mixed>|null */
    private static function readCache(string $name, string $bind): ?array
    {
        $raw = @file_get_contents(self::cacheFile($name));
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        $pt = Crypto::decrypt($raw);
        $c = $pt !== null ? json_decode($pt, true) : null;
        if (!is_array($c) || ($c['bind'] ?? '') !== $bind || (int) ($c['exp'] ?? 0) < time() + 60) {
            return null;
        }
        return $c;
    }

    /** @param array<string,mixed> $c */
    private static function writeCache(string $name, array $c): void
    {
        $f = self::cacheFile($name);
        @file_put_contents($f, Crypto::encrypt((string) json_encode($c)), LOCK_EX);
        @chmod($f, 0600);
    }

    public static function clearCaches(): void
    {
        @unlink(self::cacheFile('fcm.token'));
        @unlink(self::cacheFile('apns.jwt'));
    }

    /** OAuth access token for FCM (null = cannot get one now). $error receives the reason. */
    public static function fcmAccessToken(?string &$error = null): ?string
    {
        $sa = self::fcmServiceAccount();
        if ($sa === null) {
            $error = 'not_configured';
            return null;
        }
        $bind = hash('sha256', (string) $sa['client_email'] . '|' . (string) ($sa['private_key_id'] ?? ''));
        $cached = self::readCache('fcm.token', $bind);
        if ($cached !== null) {
            return (string) $cached['token'];
        }
        $tokenUri = (string) (Config::get('push_fcm_token_url') ?: ($sa['token_uri'] ?? 'https://oauth2.googleapis.com/token'));
        $now = time();
        $header = isset($sa['private_key_id']) ? ['kid' => (string) $sa['private_key_id']] : [];
        $assertion = Jwt::encode([
            'iss' => (string) $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud' => $tokenUri,
            'iat' => $now,
            'exp' => $now + 3600,
        ], 'RS256', (string) $sa['private_key'], $header);
        $res = Http::request('POST', $tokenUri, ['Content-Type' => 'application/x-www-form-urlencoded', 'Accept' => 'application/json'], http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $assertion,
        ]), 15, Http::isLocalHttp($tokenUri));
        $tok = is_array($res['json']) ? (string) ($res['json']['access_token'] ?? '') : '';
        if ($res['status'] !== 200 || $tok === '') {
            $error = 'token HTTP ' . $res['status'] . ' ' . substr($res['raw'] !== '' ? $res['raw'] : $res['error'], 0, 150);
            return null;
        }
        $ttl = max(120, min(3600, (int) ($res['json']['expires_in'] ?? 3600)));
        self::writeCache('fcm.token', ['bind' => $bind, 'token' => $tok, 'exp' => $now + $ttl - 300]);
        return $tok;
    }

    /** @param array<string,mixed> $p @return array{result:string, error?:string} */
    public static function sendFcm(string $deviceToken, array $p): array
    {
        $sa = self::fcmServiceAccount();
        if ($sa === null) {
            return ['result' => 'fail', 'error' => 'fcm not configured'];
        }
        $err = null;
        $access = self::fcmAccessToken($err);
        if ($access === null) {
            return ['result' => 'retry', 'error' => (string) $err];
        }
        $url = str_replace('{project}', rawurlencode((string) $sa['project_id']), (string) (Config::get('push_fcm_endpoint') ?: 'https://fcm.googleapis.com/v1/projects/{project}/messages:send'));
        $data = ['type' => (string) ($p['type'] ?? '')];
        foreach ((array) ($p['data'] ?? []) as $k => $v) {
            $data[(string) $k] = is_scalar($v) ? (string) $v : (string) json_encode($v);
        }
        $msg = [
            'token' => $deviceToken,
            'notification' => ['title' => (string) ($p['title'] ?? ''), 'body' => (string) ($p['body'] ?? '')],
            'data' => $data,
            'android' => ['priority' => 'HIGH', 'notification' => ['channel_id' => 'community'] + (!empty($p['collapse']) ? ['tag' => (string) $p['collapse']] : [])],
            'apns' => ['payload' => ['aps' => ['sound' => 'default'] + (!empty($p['collapse']) ? ['thread-id' => (string) $p['collapse']] : [])]],
        ];
        $res = Http::request('POST', $url, [
            'Authorization' => 'Bearer ' . $access,
            'Content-Type' => 'application/json',
        ], (string) json_encode(['message' => $msg], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 10, Http::isLocalHttp($url));
        $s = $res['status'];
        if ($s === 200) {
            return ['result' => 'ok'];
        }
        $raw = $res['raw'];
        if ($s === 404 || str_contains($raw, 'UNREGISTERED') || ($s === 400 && str_contains($raw, 'registration token'))) {
            return ['result' => 'drop', 'error' => 'unregistered'];
        }
        if ($s === 401) {
            @unlink(self::cacheFile('fcm.token'));
        }
        if ($s === 0 || $s === 401 || $s === 429 || $s >= 500) {
            return ['result' => 'retry', 'error' => 'HTTP ' . $s . ' ' . substr($raw !== '' ? $raw : $res['error'], 0, 150)];
        }
        return ['result' => 'fail', 'error' => 'HTTP ' . $s . ' ' . substr($raw, 0, 150)];
    }

    public static function apnsConfigured(): bool
    {
        return Integrations::get('apns_key_p8') !== '' && Integrations::get('apns_key_id') !== ''
            && Integrations::get('apns_team_id') !== '' && Integrations::get('apns_bundle_id') !== '';
    }

    /** The APNs provider token (ES256), reused for 50 minutes as Apple requires (20–60 min). */
    public static function apnsJwt(): string
    {
        $kid = Integrations::get('apns_key_id');
        $team = Integrations::get('apns_team_id');
        $bind = hash('sha256', $kid . '|' . $team . '|' . hash('sha256', Integrations::get('apns_key_p8')));
        $cached = self::readCache('apns.jwt', $bind);
        if ($cached !== null) {
            return (string) $cached['jwt'];
        }
        $now = time();
        $jwt = Jwt::encode(['iss' => $team, 'iat' => $now], 'ES256', Integrations::get('apns_key_p8'), ['kid' => $kid]);
        self::writeCache('apns.jwt', ['bind' => $bind, 'jwt' => $jwt, 'exp' => $now + 3000]);
        return $jwt;
    }

    /** @param array<string,mixed> $p @return array{result:string, error?:string} */
    public static function sendApns(string $deviceToken, array $p): array
    {
        if (!self::apnsConfigured()) {
            return ['result' => 'fail', 'error' => 'apns not configured'];
        }
        if (!preg_match('/^[A-Fa-f0-9]{32,200}$/', $deviceToken)) {
            return ['result' => 'drop', 'error' => 'bad token'];
        }
        $host = rtrim((string) (Config::get('push_apns_endpoint') ?: (Integrations::get('apns_environment') === 'sandbox'
            ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com')), '/');
        $url = $host . '/3/device/' . strtolower($deviceToken);
        $local = Http::isLocalHttp($url);
        $body = ['aps' => ['alert' => ['title' => (string) ($p['title'] ?? ''), 'body' => (string) ($p['body'] ?? '')], 'sound' => 'default']];
        if (!empty($p['collapse'])) {
            $body['aps']['thread-id'] = (string) $p['collapse'];
        }
        $body['type'] = (string) ($p['type'] ?? '');
        $body['data'] = (array) ($p['data'] ?? []);
        $headers = [
            'authorization' => 'bearer ' . self::apnsJwt(),
            'apns-topic' => Integrations::get('apns_bundle_id'),
            'apns-push-type' => 'alert',
            'apns-priority' => '10',
            'apns-expiration' => (string) (time() + 86400),
            'content-type' => 'application/json',
        ];
        if (!empty($p['collapse'])) {
            $headers['apns-collapse-id'] = substr((string) $p['collapse'], 0, 64);
        }
        $res = Http::request('POST', $url, $headers, (string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 10, $local, 0,
            $local ? [] : [CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0]);
        $s = $res['status'];
        $reason = is_array($res['json']) ? (string) ($res['json']['reason'] ?? '') : '';
        if ($s === 200) {
            return ['result' => 'ok'];
        }
        if ($s === 410 || in_array($reason, ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'], true)) {
            return ['result' => 'drop', 'error' => $reason !== '' ? $reason : 'HTTP 410'];
        }
        if ($s === 403 && in_array($reason, ['ExpiredProviderToken', 'InvalidProviderToken'], true)) {
            @unlink(self::cacheFile('apns.jwt'));
            return ['result' => 'retry', 'error' => $reason];
        }
        if ($s === 0 || $s === 429 || $s >= 500) {
            return ['result' => 'retry', 'error' => 'HTTP ' . $s . ' ' . ($reason !== '' ? $reason : substr($res['error'], 0, 150))];
        }
        return ['result' => 'fail', 'error' => 'HTTP ' . $s . ' ' . $reason];
    }
}
