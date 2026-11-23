<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Self-hosted LiveKit (rtc.nuralquran.net): access tokens, the server API (Twirp, HTTP+JSON) and webhooks.
 *
 * Keys come from the admin Integrations (encrypted): livekit_url (what clients connect to, wss://…),
 * livekit_api_key, livekit_api_secret and optionally livekit_api_url (where this API reaches the server API;
 * on the same machine http://127.0.0.1:7880 skips TLS; default = livekit_url with ws→http).
 *
 * Clients never get canPublishData: chat, reactions and room events are posted to this API (moderated, rate-limited)
 * and broadcast by the server with SendData, so nothing reaches a room without passing the dictionary filter.
 */
final class LiveKit
{
    public const TOKEN_TTL = 6 * 3600;
    /** Participant roles that may publish audio. */
    public const STAGE_ROLES = ['owner', 'moderator', 'speaker'];

    /** @var list<array{method:string, body:array<string,mixed>, status:int}> calls made in this request (tests/logs) */
    public static array $calls = [];

    public static function configured(): bool
    {
        return self::clientUrl() !== '' && Integrations::get('livekit_api_key') !== '' && Integrations::get('livekit_api_secret') !== '';
    }

    public static function clientUrl(): string
    {
        return rtrim(Integrations::get('livekit_url'), '/');
    }

    public static function apiUrl(): string
    {
        $u = rtrim(Integrations::get('livekit_api_url'), '/');
        if ($u === '') {
            $u = (string) preg_replace('#^ws(s?)://#', 'http$1://', self::clientUrl());
        }
        return $u;
    }

    /** The LiveKit room name of one of our rooms. */
    public static function roomName(int $roomId): string
    {
        return 'nq-room-' . $roomId;
    }

    /** @return array<string,mixed> the video grant for a role (never roomAdmin, never canPublishData) */
    public static function grantsFor(string $role, string $room): array
    {
        $stage = in_array($role, self::STAGE_ROLES, true);
        $g = [
            'room' => $room,
            'roomJoin' => true,
            'canSubscribe' => true,
            'canPublish' => $stage,
            'canPublishData' => false,
            'canUpdateOwnMetadata' => false,
        ];
        if ($stage) {
            $g['canPublishSources'] = ['microphone']; // audio only: no camera, no screen share
        }
        return $g;
    }

    /** @param array<string,mixed> $meta */
    public static function participantToken(int $userId, string $name, string $room, string $role, array $meta, int $ttl = self::TOKEN_TTL): string
    {
        $now = time();
        return Jwt::encode([
            'iss' => Integrations::get('livekit_api_key'),
            'sub' => (string) $userId,
            'nbf' => $now - 10,
            'iat' => $now,
            'exp' => $now + $ttl,
            'jti' => bin2hex(random_bytes(8)),
            'name' => $name,
            'metadata' => (string) json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'video' => self::grantsFor($role, $room),
        ], 'HS256', Integrations::get('livekit_api_secret'));
    }

    /** A short-lived token for the server API. */
    private static function serverToken(string $room = ''): string
    {
        $now = time();
        $video = ['roomCreate' => true, 'roomList' => true, 'roomAdmin' => true];
        if ($room !== '') {
            $video['room'] = $room;
        }
        return Jwt::encode([
            'iss' => Integrations::get('livekit_api_key'),
            'nbf' => $now - 10,
            'exp' => $now + 600,
            'video' => $video,
        ], 'HS256', Integrations::get('livekit_api_secret'));
    }

    /**
     * POST /twirp/livekit.RoomService/<method>. Returns the decoded JSON, or null on any failure (logged, never thrown:
     * a LiveKit outage must not break chat storage, closing rooms or moderation decisions).
     * @param array<string,mixed> $body
     * @return array<string,mixed>|null
     */
    public static function call(string $method, array $body, int $timeout = 6): ?array
    {
        if (!self::configured()) {
            return null;
        }
        $base = self::apiUrl();
        $local = Http::isLocalHttp($base);
        if (!$local && !str_starts_with($base, 'https://')) {
            error_log('[nq] livekit: api url must be https (or http://127.0.0.1)');
            return null;
        }
        $res = Http::request('POST', $base . '/twirp/livekit.RoomService/' . $method, [
            'Authorization' => 'Bearer ' . self::serverToken((string) ($body['room'] ?? '')),
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ], (string) json_encode($body === [] ? new \stdClass() : $body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $timeout, $local);
        self::$calls[] = ['method' => $method, 'body' => $body, 'status' => $res['status']];
        if ($res['status'] !== 200) {
            if ($res['status'] !== 404) { // not_found: the room/participant is already gone
                error_log('[nq] livekit ' . $method . ' failed: HTTP ' . $res['status'] . ' ' . substr($res['raw'] !== '' ? $res['raw'] : $res['error'], 0, 200));
            }
            return null;
        }
        return is_array($res['json']) ? $res['json'] : [];
    }

    public static function createRoom(string $room, int $maxParticipants): ?array
    {
        return self::call('CreateRoom', ['name' => $room, 'empty_timeout' => 300, 'departure_timeout' => 20, 'max_participants' => $maxParticipants]);
    }

    public static function deleteRoom(string $room): void
    {
        self::call('DeleteRoom', ['room' => $room]);
    }

    public static function removeParticipant(string $room, int $userId): void
    {
        self::call('RemoveParticipant', ['room' => $room, 'identity' => (string) $userId]);
    }

    /** Mute every audio track a participant publishes (LiveKit never lets the server unmute them). */
    public static function muteAudio(string $room, int $userId): int
    {
        $p = self::call('GetParticipant', ['room' => $room, 'identity' => (string) $userId]);
        $n = 0;
        foreach ((array) ($p['tracks'] ?? []) as $t) {
            $type = strtoupper((string) ($t['type'] ?? ''));
            if (is_array($t) && ($type === 'AUDIO' || $type === '0') && !empty($t['sid'])) {
                self::call('MutePublishedTrack', ['room' => $room, 'identity' => (string) $userId, 'track_sid' => (string) $t['sid'], 'muted' => true]);
                $n++;
            }
        }
        return $n;
    }

    /** Change what a connected participant may do (raise to / lower from the stage) and their metadata. @param array<string,mixed> $meta */
    public static function updateParticipant(string $room, int $userId, string $role, array $meta): void
    {
        $stage = in_array($role, self::STAGE_ROLES, true);
        self::call('UpdateParticipant', [
            'room' => $room,
            'identity' => (string) $userId,
            'metadata' => (string) json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'permission' => [
                'can_subscribe' => true,
                'can_publish' => $stage,
                'can_publish_data' => false,
                'can_publish_sources' => $stage ? ['MICROPHONE'] : [],
            ],
        ]);
    }

    /**
     * Broadcast a JSON event to the room (reliable data packet). $to = user ids (empty = everyone).
     * @param array<string,mixed> $event @param list<int> $to
     */
    public static function sendData(string $room, string $topic, array $event, array $to = []): void
    {
        $body = [
            'room' => $room,
            'data' => base64_encode((string) json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
            'kind' => 'RELIABLE',
            'topic' => $topic,
        ];
        if ($to !== []) {
            $body['destination_identities'] = array_map('strval', $to);
        }
        self::call('SendData', $body);
    }

    /**
     * Webhooks: `Authorization` carries an HS256 JWT signed with the API secret (iss = API key) whose `sha256` claim is
     * base64(sha256(raw body)).
     */
    public static function verifyWebhook(?string $authorization, string $rawBody): bool
    {
        $secret = Integrations::get('livekit_api_secret');
        $key = Integrations::get('livekit_api_key');
        if ($authorization === null || $secret === '' || $key === '') {
            return false;
        }
        $jwt = (string) preg_replace('/^Bearer\s+/i', '', trim($authorization));
        $claims = Jwt::decodeHs256($jwt, $secret, 300);
        if ($claims === null || !hash_equals($key, (string) ($claims['iss'] ?? ''))) {
            return false;
        }
        $want = (string) ($claims['sha256'] ?? '');
        $got = base64_encode(hash('sha256', $rawBody, true));
        return $want !== '' && (hash_equals($got, $want) || hash_equals(rtrim(strtr($got, '+/', '-_'), '='), rtrim(strtr($want, '+/', '-_'), '=')));
    }
}
