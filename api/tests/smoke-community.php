<?php
declare(strict_types=1);

/**
 * Voice rooms & community checks — included by smoke.php (uses its req()/check()/data()/errc()/desc()/pdo() helpers,
 * $tadm, $run, $LOCAL, $opt). Needs --local and --fake-upstream (LiveKit, FCM and APNs stand-ins in fake-upstream.php).
 */

/** @var array<string,mixed> $opt */
/** @var array<string,mixed> $tadm */
/** @var string $run */
/** @var string|null $LOCAL */

section('Rooms & community');
if ($LOCAL === null || !isset($opt['fake-upstream'])) {
    echo "  (community checks skipped — pass --local and --fake-upstream)\n";
    return;
}
$FAKE = rtrim((string) $opt['fake-upstream'], '/');
$fakeState = sys_get_temp_dir() . '/nq-fake-upstream-' . (string) parse_url($FAKE, PHP_URL_PORT);
@unlink($fakeState . '/livekit.log');
@unlink($fakeState . '/push.log');

/** @return list<array<string,mixed>> */
$logLines = static function (string $file) use ($fakeState): array {
    $out = [];
    foreach (is_file($fakeState . '/' . $file) ? (file($fakeState . '/' . $file) ?: []) : [] as $l) {
        $j = json_decode($l, true);
        if (is_array($j)) {
            $out[] = $j;
        }
    }
    return $out;
};
$lkCalls = static fn (string $method): array => array_values(array_filter($logLines('livekit.log'), static fn (array $c): bool => $c['method'] === $method));
$pushes = static fn (string $kind): array => array_values(array_filter($logLines('push.log'), static fn (array $c): bool => $c['kind'] === $kind));
$b64u = static fn (string $s): string => (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
$jwtParts = static function (string $jwt) use ($b64u): array {
    $p = explode('.', $jwt);
    return count($p) === 3 ? [json_decode($b64u($p[0]), true), json_decode($b64u($p[1]), true), $b64u($p[2]), $p[0] . '.' . $p[1]] : [null, null, '', ''];
};
$rawToDer = static function (string $raw): string {
    $enc = static function (string $i): string {
        $i = ltrim($i, "\0");
        if ($i === '' || (ord($i[0]) & 0x80)) {
            $i = "\0" . $i;
        }
        return "\x02" . chr(strlen($i)) . $i;
    };
    $seq = $enc(substr($raw, 0, 32)) . $enc(substr($raw, 32));
    return "\x30" . chr(strlen($seq)) . $seq;
};
$db = pdo();
$q1 = static function (string $sql, array $p = []) use ($db): mixed {
    $st = $db->prepare($sql);
    $st->execute($p);
    return $st->fetchColumn();
};

// ── Runtime migration: an install from an older schema.sql gets the new tables on the next request
$db->exec('DROP TABLE dictionary_words');
array_map('unlink', glob($LOCAL . '/storage/schema-*.version') ?: []);
req('GET', '/health');
check('Migrations v4 recreates missing community tables from schema.sql', (int) $q1("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dictionary_words'") === 1
    && (int) @file_get_contents((string) (glob($LOCAL . '/storage/schema-*.version')[0] ?? '')) === 4);

// ── Keys: LiveKit, FCM service account (RSA), APNs .p8 (EC P-256) — test keys made here, endpoints = the stand-ins
$LK_KEY = 'APItestkey';
$LK_SECRET = 'lk-secret-' . bin2hex(random_bytes(20));
$rsa = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
openssl_pkey_export($rsa, $rsaPem);
$rsaPub = openssl_pkey_get_details($rsa)['key'];
$sa = ['type' => 'service_account', 'project_id' => 'nq-test', 'private_key_id' => 'kid-123', 'private_key' => $rsaPem,
    'client_email' => 'push@nq-test.iam.gserviceaccount.com', 'token_uri' => $FAKE . '/fcm/token'];
$ec = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
openssl_pkey_export($ec, $ecPem);
$ecPub = openssl_pkey_get_details($ec)['key'];
$badLk = req('PUT', '/admin/integrations', ['livekit_url' => 'http://rtc.example.com'], $tadm);
check('integrations: livekit_url must be wss://', $badLk['status'] === 422, desc($badLk));
$badSa = req('PUT', '/admin/integrations', ['fcm_service_account' => '{"type":"service_account"}'], $tadm);
check('integrations: an invalid service-account JSON is refused', $badSa['status'] === 422, desc($badSa));
$ik = req('PUT', '/admin/integrations', [
    'livekit_url' => 'ws://127.0.0.1:' . parse_url($FAKE, PHP_URL_PORT), 'livekit_api_url' => $FAKE . '/livekit',
    'livekit_api_key' => $LK_KEY, 'livekit_api_secret' => $LK_SECRET,
    'fcm_service_account' => json_encode($sa, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    'apns_key_p8' => $ecPem, 'apns_key_id' => 'KEY123ABCD', 'apns_team_id' => 'TEAM12345Z', 'apns_bundle_id' => 'net.nuralquran.app', 'apns_environment' => 'sandbox',
], $tadm);
check('integrations: LiveKit / FCM (multi-line JSON) / APNs keys saved; secrets never echoed', $ik['status'] === 200
    && !str_contains($ik['raw'], $LK_SECRET) && !str_contains($ik['raw'], 'BEGIN PRIVATE KEY'), desc($ik));
$cfgFile = $LOCAL . '/config.php';
$cfg = require $cfgFile;
$cfg['push_fcm_endpoint'] = $FAKE . '/fcm/v1/projects/{project}/messages:send';
$cfg['push_apns_endpoint'] = $FAKE . '/apns';
file_put_contents($cfgFile, "<?php\nreturn " . var_export($cfg, true) . ";\n");
chmod($cfgFile, 0600);
sleep(3); // let OPcache (revalidate_freq) see the rewritten config.php
foreach (['livekit', 'fcm', 'apns'] as $t) {
    $ti = req('POST', '/admin/integrations/test', ['target' => $t], $tadm);
    check("integration test «{$t}» → ok", $ti['status'] === 200 && (data($ti)['ok'] ?? false) === true, desc($ti));
}
check('integration test «livekit» called ListRooms with a signed server token', count($lkCalls('ListRooms')) >= 1
    && ($jwtParts(substr((string) ($lkCalls('ListRooms')[0]['auth'] ?? ''), 7))[1]['video']['roomList'] ?? false) === true);

// ── People
$adult = '1990-05-01';
$minorBd = ((int) gmdate('Y') - 15) . '-01-01';
$kidBd = ((int) gmdate('Y') - 10) . '-01-01';
$mk = static function (string $key, string $name, ?string $gender, ?string $bd, string $ip) use ($run): array {
    $email = "{$key}+{$run}@example.com";
    $s = req('POST', '/auth/signup', ['name' => $name, 'email' => $email, 'password' => 'community-pass-1'], ['ip' => $ip]);
    $a = ['token' => (string) (data($s)['token'] ?? ''), 'ip' => $ip, 'id' => (int) (data($s)['user']['id'] ?? 0), 'name' => $name];
    if ($gender !== null) {
        req('PATCH', '/me/community-profile', ['gender' => $gender, 'birthdate' => $bd], $a);
    }
    return $a;
};
$M1 = $mk('m1', 'أحمد', 'male', $adult, '10.70.0.1');
$M2 = $mk('m2', 'بلال', 'male', $adult, '10.70.0.2');
$M3 = $mk('m3', 'يوسف الصغير', 'male', $minorBd, '10.70.0.3');
$W1 = $mk('w1', 'فاطمة', 'female', $adult, '10.70.0.4');
$W2 = $mk('w2', 'مريم', 'female', $adult, '10.70.0.5');
$LEG = $mk('leg', 'حساب قديم', null, null, '10.70.0.6');
$KID = $mk('kid', 'طفل', null, null, '10.70.0.7');
check('community actors created', $M1['id'] > 0 && $M2['id'] > 0 && $M3['id'] > 0 && $W1['id'] > 0 && $W2['id'] > 0 && $LEG['id'] > 0 && $KID['id'] > 0);
$srch = static fn (string $q, array $who): array => array_map(static fn ($u) => (int) $u['id'], (array) (data(req('GET', '/people?q=' . rawurlencode($q), null, $who))['items'] ?? []));
check('people search: same gender only (a man searching «فاطمة» finds nobody, a woman finds her)',
    !in_array($W1['id'], $srch('فاطمة', $M1), true) && in_array($W1['id'], $srch('فاطمة', $W2), true) && in_array($M2['id'], $srch('بلال', $M1), true));

// ── Gender / age gating
$g0 = req('GET', '/rooms', null, $LEG);
check('no gender/birthdate → 409 community_profile_required with missing fields', $g0['status'] === 409 && errc($g0) === 'community_profile_required'
    && ($g0['json']['error']['missing'] ?? []) === ['gender', 'birthdate'], desc($g0));
$cp0 = req('GET', '/me/community-profile', null, $LEG);
check('GET /me/community-profile before joining: joined false, both missing', $cp0['status'] === 200 && (data($cp0)['joined'] ?? null) === false && count((array) (data($cp0)['missing'] ?? [])) === 2, desc($cp0));
$k1 = req('PATCH', '/me/community-profile', ['gender' => 'male', 'birthdate' => $kidBd], $KID);
check('under 13: profile saved but not eligible (underage)', $k1['status'] === 200 && (data($k1)['eligible'] ?? null) === false && (data($k1)['underage'] ?? null) === true, desc($k1));
$k2 = req('GET', '/rooms', null, $KID);
check('under 13 → 403 underage on rooms', $k2['status'] === 403 && errc($k2) === 'underage', desc($k2));
$k3 = req('PATCH', '/me/community-profile', ['birthdate' => '1990-01-01'], $KID);
check('birthdate cannot be changed after it was set → 409 birthdate_locked', $k3['status'] === 409 && errc($k3) === 'birthdate_locked', desc($k3));
$gl = req('PATCH', '/me/community-profile', ['gender' => 'female'], $M1);
check('gender cannot be changed after joining → 409 gender_locked', $gl['status'] === 409 && errc($gl) === 'gender_locked', desc($gl));
$gl2 = req('PATCH', '/auth/profile', ['gender' => 'female'], $M1);
check('…not through /auth/profile either', $gl2['status'] === 409 && errc($gl2) === 'gender_locked', desc($gl2));
$same = req('PATCH', '/me/community-profile', ['gender' => 'male', 'birthdate' => $adult], $M1);
check('re-sending the same gender/birthdate is fine', $same['status'] === 200 && (data($same)['joined'] ?? null) === true && (data($same)['locked']['gender'] ?? null) === true, desc($same));
$mp = req('GET', '/me/community-profile', null, $M3);
check('minor: is_minor, profile forced private, DMs off', (data($mp)['is_minor'] ?? null) === true && (data($mp)['profile']['is_private'] ?? null) === true
    && (data($mp)['profile']['private_forced'] ?? null) === true && (data($mp)['profile']['dm_policy'] ?? '') === 'none', desc($mp));

// ── Profile fields
$bl = req('PATCH', '/me/community-profile', ['bio' => 'زوروا موقعي www.example.com'], $M1);
check('bio with a link → 422', $bl['status'] === 422, desc($bl));
$ig = req('PATCH', '/me/community-profile', ['instagram_url' => 'https://evil.example/me'], $M1);
check('instagram link on another host → 422', $ig['status'] === 422, desc($ig));
$pf = req('PATCH', '/me/community-profile', ['bio' => 'طالب علم', 'facebook_url' => 'facebook.com/ahmad.q', 'instagram_url' => 'https://www.instagram.com/ahmad.q/'], $M1);
check('bio + facebook/instagram saved (https normalised)', $pf['status'] === 200 && (data($pf)['profile']['facebook_url'] ?? '') === 'https://facebook.com/ahmad.q'
    && (data($pf)['profile']['bio'] ?? '') === 'طالب علم', desc($pf));
req('PATCH', '/me/community-profile', ['dm_policy' => 'friends', 'is_private' => true], $W2);
req('PATCH', '/me/community-profile', ['dm_policy' => 'everyone'], $M2);

// ── Devices (push)
$FCM_M2 = 'fcm-m2-' . str_repeat('a', 40);
$APNS_W1 = str_repeat('ab', 32);
$d1 = req('POST', '/me/devices', ['provider' => 'fcm', 'token' => $FCM_M2, 'platform' => 'android', 'app_version' => '2.0.0'], $M2 + ['client' => 'app']);
$d2 = req('POST', '/me/devices', ['provider' => 'apns', 'token' => strtoupper($APNS_W1), 'platform' => 'ios'], $W1 + ['client' => 'app']);
$d3 = req('POST', '/me/devices', ['provider' => 'apns', 'token' => 'not-hex'], $W1 + ['client' => 'app']);
check('POST /me/devices (fcm + apns); bad APNs token → 422', $d1['status'] === 201 && $d2['status'] === 201 && $d3['status'] === 422, desc($d1) . ' / ' . desc($d3));

// ── Follows, then rooms: visibility per gender + notification fan-out
req('POST', "/people/{$M1['id']}/follow", null, $M2);
req('POST', "/people/{$M1['id']}/follow", null, $W1);
req('POST', "/people/{$M1['id']}/follow", null, $M3);
$rA = req('POST', '/rooms', ['title' => 'حلقة تلاوة للرجال', 'gender_scope' => 'men'], $M1);
$A = (int) (data($rA)['id'] ?? 0);
check('M1 opens a men\'s room → 201 open', $rA['status'] === 201 && (data($rA)['status'] ?? '') === 'open' && (data($rA)['my_role'] ?? '') === 'owner', desc($rA));
check('LiveKit CreateRoom called for nq-room-<id>', count(array_filter($lkCalls('CreateRoom'), static fn ($c) => ($c['body']['name'] ?? '') === 'nq-room-' . $A)) === 1);
$wl = req('GET', '/rooms?tab=live', null, $W1);
check('a woman never sees a men\'s room in the list', $wl['status'] === 200 && !in_array($A, array_column((array) (data($wl)['items'] ?? []), 'id'), true), desc($wl));
$ws = req('GET', '/rooms?tab=live&q=' . urlencode('تلاوة'), null, $W1);
check('…nor in search', !in_array($A, array_column((array) (data($ws)['items'] ?? []), 'id'), true), desc($ws));
$wd = req('GET', "/rooms/{$A}", null, $W1);
$wj = req('POST', "/rooms/{$A}/join", null, $W1);
check('…nor by id (404, not 403) and cannot join it', $wd['status'] === 404 && $wj['status'] === 404, desc($wd) . ' / ' . desc($wj));
$ml = req('GET', '/rooms?tab=live', null, $M2);
check('a man sees it', in_array($A, array_column((array) (data($ml)['items'] ?? []), 'id'), true), desc($ml));
$nM2 = req('GET', '/me/notifications', null, $M2);
$nW1 = req('GET', '/me/notifications', null, $W1);
$types = static fn (array $res): array => array_map(static fn ($n) => $n['type'] . ':' . ($n['data']['room_id'] ?? ''), (array) (data($res)['items'] ?? []));
check('follower M2 notified «room_opened»; follower W1 (woman) not', in_array('room_opened:' . $A, $types($nM2), true) && !in_array('room_opened:' . $A, $types($nW1), true), json_encode([$types($nM2), $types($nW1)]));
check('minor follower M3 notified for the men\'s room', in_array('room_opened:' . $A, $types(req('GET', '/me/notifications', null, $M3)), true));
$fcmSend = $pushes('fcm_send');
$fcmTok = $pushes('fcm_token');
check('push: FCM HTTP v1 send to M2\'s token with the OAuth access token', count($fcmSend) >= 1
    && str_contains((string) ($fcmSend[0]['body'] ?? ''), $FCM_M2) && str_starts_with((string) ($fcmSend[0]['headers']['authorization'] ?? ''), 'Bearer fake-access-')
    && str_contains((string) $fcmSend[0]['path'], '/projects/nq-test/messages:send'), json_encode($fcmSend[0] ?? null, JSON_UNESCAPED_UNICODE));
[$ah, $ac, $as, $ain] = $jwtParts((string) ($fcmTok[0]['assertion'] ?? ''));
check('push: FCM service-account assertion is RS256, verifies with the public key, right claims', ($ah['alg'] ?? '') === 'RS256' && ($ah['kid'] ?? '') === 'kid-123'
    && openssl_verify($ain, $as, $rsaPub, OPENSSL_ALGO_SHA256) === 1 && ($ac['iss'] ?? '') === $sa['client_email'] && ($ac['aud'] ?? '') === $sa['token_uri']
    && ($ac['scope'] ?? '') === 'https://www.googleapis.com/auth/firebase.messaging', json_encode([$ah, $ac]));
check('push: nothing was sent to the woman\'s iPhone for a men\'s room', count($pushes('apns_send')) === 0);
check('push queue rows: sent', (int) $q1("SELECT COUNT(*) FROM push_queue WHERE status = 'sent'") >= 1);

$rB = req('POST', '/rooms', ['title' => 'مجلس تدبر مختلط', 'gender_scope' => 'mixed'], $M1);
$B = (int) (data($rB)['id'] ?? 0);
check('mixed room visible to a woman', in_array($B, array_column((array) (data(req('GET', '/rooms?tab=live', null, $W1))['items'] ?? []), 'id'), true));
check('W1 notified for the mixed room', in_array('room_opened:' . $B, $types(req('GET', '/me/notifications', null, $W1)), true));
$apns = $pushes('apns_send');
[$jh, $jc, $js, $jin] = $jwtParts(substr((string) ($apns[0]['headers']['authorization'] ?? ''), 7));
check('push: APNs to the device token with an ES256 provider token that verifies (kid, iss = team), topic = bundle id', count($apns) >= 1
    && ($apns[0]['device'] ?? '') === $APNS_W1 && ($apns[0]['headers']['apns-topic'] ?? '') === 'net.nuralquran.app'
    && ($jh['alg'] ?? '') === 'ES256' && ($jh['kid'] ?? '') === 'KEY123ABCD' && ($jc['iss'] ?? '') === 'TEAM12345Z' && strlen($js) === 64
    && openssl_verify($jin, $rawToDer($js), $ecPub, OPENSSL_ALGO_SHA256) === 1, json_encode([$apns[0]['headers'] ?? null, $jh, $jc]));
$ww = req('POST', '/rooms', ['title' => 'غرفة رجال', 'gender_scope' => 'men'], $W1);
check('a woman cannot open a men\'s room → 422', $ww['status'] === 422, desc($ww));
$rW = req('POST', '/rooms', ['title' => 'حلقة النساء', 'gender_scope' => 'women'], $W1);
$WR = (int) (data($rW)['id'] ?? 0);
check('a man never sees a women\'s room', $rW['status'] === 201 && !in_array($WR, array_column((array) (data(req('GET', '/rooms?tab=live', null, $M2))['items'] ?? []), 'id'), true)
    && req('GET', "/rooms/{$WR}", null, $M2)['status'] === 404, desc($rW));
$rC = req('POST', '/rooms', ['title' => 'درس مجدول', 'gender_scope' => 'men', 'scheduled_at' => gmdate('Y-m-d\TH:i:s\Z', time() + 7200)], $M1);
$C = (int) (data($rC)['id'] ?? 0);
check('scheduled room → status scheduled; followers get «room_scheduled»', $rC['status'] === 201 && (data($rC)['status'] ?? '') === 'scheduled'
    && in_array('room_scheduled:' . $C, $types(req('GET', '/me/notifications', null, $M2)), true), desc($rC));
$r4 = req('POST', '/rooms', ['title' => 'غرفة رابعة', 'gender_scope' => 'mixed'], $M1);
check('per-person limit (3 open/scheduled) → 409 room_limit', $r4['status'] === 409 && errc($r4) === 'room_limit', desc($r4));
$past = req('POST', '/rooms', ['title' => 'موعد ماض', 'gender_scope' => 'men', 'scheduled_at' => '2020-01-01T00:00:00Z'], $M2);
check('scheduled_at in the past → 422', $past['status'] === 422, desc($past));

// ── Joining, token grants
$jo = req('POST', "/rooms/{$B}/join", null, $M1);
$jl = req('POST', "/rooms/{$B}/join", null, $W1);
[$oh, $oc, $osig, $oin] = $jwtParts((string) (data($jo)['token'] ?? ''));
[$lh, $lc, $lsig, $lin] = $jwtParts((string) (data($jl)['token'] ?? ''));
check('join → {url, token, identity, role}', $jo['status'] === 200 && (data($jo)['role'] ?? '') === 'owner' && (data($jl)['role'] ?? '') === 'listener'
    && (data($jl)['url'] ?? '') === 'ws://127.0.0.1:' . parse_url($FAKE, PHP_URL_PORT) && (data($jl)['identity'] ?? '') === (string) $W1['id'], desc($jl));
check('LiveKit token: HS256 signed with the API secret, iss = key, sub = user id, room grant', ($lh['alg'] ?? '') === 'HS256'
    && hash_equals(hash_hmac('sha256', $lin, $LK_SECRET, true), $lsig) && ($lc['iss'] ?? '') === $LK_KEY && ($lc['sub'] ?? '') === (string) $W1['id']
    && ($lc['video']['room'] ?? '') === 'nq-room-' . $B && ($lc['video']['roomJoin'] ?? false) === true && ($lc['exp'] ?? 0) > time(), json_encode($lc, JSON_UNESCAPED_UNICODE));
check('listener grants: subscribe only (no publish, no data, no roomAdmin)', ($lc['video']['canSubscribe'] ?? null) === true && ($lc['video']['canPublish'] ?? null) === false
    && ($lc['video']['canPublishData'] ?? null) === false && !isset($lc['video']['roomAdmin']) && (json_decode((string) ($lc['metadata'] ?? ''), true)['role'] ?? '') === 'listener');
check('owner grants: publish microphone only', ($oc['video']['canPublish'] ?? null) === true && ($oc['video']['canPublishSources'] ?? null) === ['microphone']
    && ($oc['video']['canPublishData'] ?? null) === false && ($oc['name'] ?? '') === 'أحمد', json_encode($oc['video'] ?? null));
$jm = req('POST', "/rooms/{$B}/join", null, $M2);
$jmin = req('POST', "/rooms/{$B}/join", null, $M3);
check('a minor may join a mixed room', $jm['status'] === 200 && $jmin['status'] === 200 && (data($jmin)['role'] ?? '') === 'listener', desc($jmin));
$jw2 = req('POST', "/rooms/{$B}/join", null, $W2);
$sh = req('GET', "/rooms/{$B}", null, $W1);
check('room shows counts (stage 1 owner, 4 listeners) and the stage', (data($sh)['speaker_count'] ?? 0) === 1 && (data($sh)['listener_count'] ?? 0) === 4
    && (data($sh)['stage'][0]['id'] ?? 0) === $M1['id'], desc($sh));

// ── "In a room now" per gender rules
req('POST', "/rooms/{$A}/join", null, $M2); // M2 is now in the men's room A (most recent)
$pv = req('GET', "/people/{$M2['id']}", null, $W1);
$pv2 = req('GET', "/people/{$M2['id']}", null, $M1);
check('«in a room now»: a woman sees nothing for a man in a men\'s room; a man sees the room', $pv['status'] === 200 && array_key_exists('in_room', (array) data($pv))
    && data($pv)['in_room'] === null && (data($pv2)['in_room']['id'] ?? 0) === $A, desc($pv) . ' / ' . desc($pv2));
req('POST', "/rooms/{$A}/leave", ['quiet' => true], $M2);

// ── Role permissions
$noPerm = req('POST', "/rooms/{$B}/speakers/{$W1['id']}", null, $M2);
check('a listener cannot bring someone on stage → 403', $noPerm['status'] === 403, desc($noPerm));
$hand = req('POST', "/rooms/{$B}/hand", null, $M2);
$hands = data(req('GET', "/rooms/{$B}", null, $M1))['hands'] ?? [];
check('raise hand → owner sees it in hands', $hand['status'] === 200 && in_array($M2['id'], array_column((array) $hands, 'id'), true), desc($hand));
$up = req('POST', "/rooms/{$B}/speakers/{$M2['id']}", null, $M1);
$upd = array_values(array_filter($lkCalls('UpdateParticipant'), static fn ($c) => ($c['body']['identity'] ?? '') === (string) $M2['id']));
check('owner raises M2 to speaker → LiveKit UpdateParticipant can_publish (microphone), metadata role', $up['status'] === 200 && (data($up)['role'] ?? '') === 'speaker'
    && ($upd[0]['body']['permission']['can_publish'] ?? null) === true && ($upd[0]['body']['permission']['can_publish_sources'] ?? null) === ['MICROPHONE']
    && (json_decode((string) ($upd[0]['body']['metadata'] ?? ''), true)['role'] ?? '') === 'speaker', desc($up));
check('M2 notified «speak_invite»', count(array_filter($pushes('fcm_send'), static fn ($p) => str_contains((string) $p['body'], 'speak_invite'))) >= 1);
$sk = req('POST', "/rooms/{$B}/participants/{$W2['id']}/kick", null, $M2);
check('a speaker cannot kick → 403', $sk['status'] === 403, desc($sk));
$mod = req('POST', "/rooms/{$B}/moderators/{$M2['id']}", null, $M1);
check('owner assigns a moderator', $mod['status'] === 200 && (data($mod)['role'] ?? '') === 'moderator', desc($mod));
$modMod = req('POST', "/rooms/{$B}/moderators/{$W1['id']}", null, $M2);
check('a moderator cannot assign moderators → 403', $modMod['status'] === 403, desc($modMod));
$kickOwner = req('POST', "/rooms/{$B}/participants/{$M1['id']}/kick", null, $M2);
check('a moderator cannot kick the owner → 403', $kickOwner['status'] === 403, desc($kickOwner));
$mute = req('POST', "/rooms/{$B}/participants/{$W1['id']}/mute", null, $M2);
check('moderator mutes → LiveKit GetParticipant + MutePublishedTrack', $mute['status'] === 200 && (data($mute)['muted_tracks'] ?? 0) === 1
    && count(array_filter($lkCalls('MutePublishedTrack'), static fn ($c) => ($c['body']['identity'] ?? '') === (string) $W1['id'] && ($c['body']['muted'] ?? false) === true)) === 1, desc($mute));
$title = req('PATCH', "/rooms/{$B}", ['title' => 'عنوان جديد'], $M2);
check('a moderator cannot change the title → 403', $title['status'] === 403, desc($title));
$page = req('PUT', "/rooms/{$B}/page", ['surah' => 18, 'ayah' => 10, 'page' => 294], $M2);
$pageBad = req('PUT', "/rooms/{$B}/page", ['surah' => 1, 'ayah' => 8], $M2);
$pageL = req('PUT', "/rooms/{$B}/page", ['surah' => 1, 'ayah' => 1], $W1);
check('shared mushaf page: moderator sets it (broadcast), bad ayah 422, listener 403', $page['status'] === 200 && $pageBad['status'] === 422 && $pageL['status'] === 403
    && (data(req('GET', "/rooms/{$B}", null, $W2))['shared']['surah'] ?? 0) === 18
    && count(array_filter($lkCalls('SendData'), static fn ($c) => ($c['body']['topic'] ?? '') === 'page')) >= 1, desc($page));
$kick = req('POST', "/rooms/{$B}/participants/{$W2['id']}/kick", null, $M2);
$rej = req('POST', "/rooms/{$B}/join", null, $W2);
check('moderator kicks a listener → RemoveParticipant; cannot rejoin or read the chat (403 kicked)', $kick['status'] === 200 && $rej['status'] === 403 && errc($rej) === 'kicked'
    && req('GET', "/rooms/{$B}/chat", null, $W2)['status'] === 403
    && count(array_filter($lkCalls('RemoveParticipant'), static fn ($c) => ($c['body']['identity'] ?? '') === (string) $W2['id'])) >= 1, desc($rej));
$lock = req('PATCH', "/rooms/{$B}", ['locked' => true], $M1);
$newcomer = $mk('m4', 'عمر', 'male', $adult, '10.70.0.8');
$lj = req('POST', "/rooms/{$B}/join", null, $newcomer);
check('locked room: newcomers refused (403 room_locked)', $lock['status'] === 200 && $lj['status'] === 403 && errc($lj) === 'room_locked', desc($lj));
req('PATCH', "/rooms/{$B}", ['locked' => false], $M1);

// ── Reactions
$c1 = req('POST', "/rooms/{$B}/reactions", ['type' => 'clap'], $W1);
$c2 = req('POST', "/rooms/{$B}/reactions", ['type' => 'heart'], $W1);
check('reaction, then another within 2 s → 429', $c1['status'] === 200 && $c2['status'] === 429, desc($c2));
$bad = req('POST', "/rooms/{$B}/reactions", ['type' => 'thumbs_up'], $M3);
check('unknown reaction → 422', $bad['status'] === 422, desc($bad));
usleep(2100000);
$d1 = req('POST', "/rooms/{$B}/reactions", ['type' => 'clap', 'to_user_id' => $M1['id']], $W1);
check('directed clap «فلان سقّف لفلان» to the owner on stage', $d1['status'] === 200 && (data($d1)['to']['id'] ?? 0) === $M1['id'] && (data($d1)['from']['id'] ?? 0) === $W1['id'], desc($d1));
usleep(2100000);
$d2 = req('POST', "/rooms/{$B}/reactions", ['type' => 'clap', 'to_user_id' => $M1['id']], $W1);
check('same sender → same speaker again within a minute → 429', $d2['status'] === 429, desc($d2));
usleep(2100000);
$d3 = req('POST', "/rooms/{$B}/reactions", ['type' => 'clap', 'to_user_id' => $M3['id']], $W1);
check('directed clap to a listener → 422', $d3['status'] === 422, desc($d3));
check('reactions are broadcast with SendData topic reaction', count(array_filter($lkCalls('SendData'), static fn ($c) => ($c['body']['topic'] ?? '') === 'reaction')) >= 2);

// ── Friends (minors excluded), counters, lists
$fm = req('POST', "/people/{$M1['id']}/friend-request", null, $M3);
$fm2 = req('POST', "/people/{$M3['id']}/friend-request", null, $M1);
check('minors: friend requests refused both ways (403 minor_restricted)', $fm['status'] === 403 && errc($fm) === 'minor_restricted' && $fm2['status'] === 403, desc($fm));
$fol = req('POST', "/people/{$M3['id']}/follow", null, $M1);
check('…but a minor can be followed', $fol['status'] === 200, desc($fol));
$mv = req('GET', "/people/{$M3['id']}", null, $M1);
check('a minor\'s profile is private (no bio/counters) and offers no friend/message', (data($mv)['is_private'] ?? null) === true && !array_key_exists('counters', (array) data($mv))
    && (data($mv)['can_friend'] ?? null) === false && (data($mv)['can_message'] ?? null) === false, desc($mv));
$fr = req('POST', "/people/{$M1['id']}/friend-request", null, $W1);
$frl = req('GET', '/me/friend-requests', null, $M1);
check('friend request → incoming list + notification', $fr['status'] === 201 && in_array($W1['id'], array_column((array) (data($frl)['incoming'] ?? []), 'id'), true)
    && in_array('friend_request:', $types(req('GET', '/me/notifications', null, $M1)), true), desc($fr));
check('an unanswered request leaves the requester a follower', (data(req('GET', "/people/{$M1['id']}", null, $W1))['relation']['i_follow'] ?? null) === true);
$acc = req('POST', "/me/friend-requests/{$W1['id']}/accept", null, $M1);
check('accept → friends', $acc['status'] === 200 && (data(req('GET', "/people/{$M1['id']}", null, $W1))['relation']['is_friend'] ?? null) === true, desc($acc));
$pub = req('GET', "/people/{$M1['id']}", null, $M2);
check('public profile: counters visible to everyone (claps received 1)', ($pub['json']['data']['counters']['claps_received'] ?? -1) === 1
    && ($pub['json']['data']['counters']['friends'] ?? -1) === 1 && (data($pub)['lists_visible'] ?? null) === false, desc($pub));
$lst = req('GET', "/people/{$M1['id']}/clappers", null, $M2);
$lstF = req('GET', "/people/{$M1['id']}/clappers", null, $W1);
check('who clapped: friends only (403 for others; friend sees W1 ×1)', $lst['status'] === 403 && $lstF['status'] === 200
    && (data($lstF)['items'][0]['id'] ?? 0) === $W1['id'] && (data($lstF)['items'][0]['claps'] ?? 0) === 1, desc($lstF));
check('claps sent counted', (data(req('GET', '/me/community-profile', null, $W1))['profile']['counters']['claps_sent'] ?? 0) === 2);
$priv = req('GET', "/people/{$W2['id']}", null, $M1);
check('private profile: no bio/counters for non-friends', $priv['status'] === 200 && (data($priv)['is_private'] ?? null) === true && !array_key_exists('bio', (array) data($priv)), desc($priv));

// ── DM rules matrix
$dm = static fn (array $from, array $to, string $body) => req('POST', '/me/conversations', ['user_id' => $to['id'], 'body' => $body], $from);
$x1 = $dm($M2, $W1, 'السلام عليكم');
check('DM: W1 «same gender only» refuses a man → 403 dm_not_allowed', $x1['status'] === 403 && errc($x1) === 'dm_not_allowed', desc($x1));
$x2 = $dm($M1, $W1, 'وعليكم السلام');
check('DM: friends always (M1 → W1)', $x2['status'] === 201, desc($x2));
$x3 = $dm($M1, $W2, 'مرحبا');
check('DM: W2 «friends only» refuses a non-friend', $x3['status'] === 403 && errc($x3) === 'dm_not_allowed', desc($x3));
$x4 = $dm($W2, $W1, 'أهلاً أختي');
$cWW = (int) (data($x4)['conversation_id'] ?? 0);
check('DM: same gender allowed by W1\'s «same gender»', $x4['status'] === 201 && $cWW > 0, desc($x4));
$x5 = req('POST', "/me/conversations/{$cWW}/messages", ['body' => 'أهلاً بك'], $W1);
check('DM: W1 may reply to W2 although W2 is «friends only» (W2 started it)', $x5['status'] === 201, desc($x5));
$x6 = $dm($M1, $M3, 'مرحبا');
$x7 = $dm($M3, $M1, 'مرحبا');
check('DM: minors cannot send or receive (403 minor_restricted)', $x6['status'] === 403 && errc($x6) === 'minor_restricted' && $x7['status'] === 403, desc($x6));
$x8 = $dm($M1, $M2, 'يا أخي');
$cMM = (int) (data($x8)['conversation_id'] ?? 0);
check('DM: «everyone»', $x8['status'] === 201, desc($x8));
req('PATCH', '/me/community-profile', ['dm_policy' => 'friends'], $M2);
$x9 = req('POST', "/me/conversations/{$cMM}/messages", ['body' => 'رسالة ثانية'], $M1);
$x10 = req('POST', "/me/conversations/{$cMM}/messages", ['body' => 'ردّ'], $M2);
check('DM: the starter is bound by the other side\'s new policy; the other side may still reply', $x9['status'] === 403 && $x10['status'] === 201, desc($x9) . ' / ' . desc($x10));
$x11 = $dm($M1, $W1, 'انظر https://example.com');
check('DM: text only, links refused → 422 links_not_allowed', $x11['status'] === 422 && errc($x11) === 'links_not_allowed', desc($x11));
$inbox = req('GET', '/me/conversations', null, $W1);
$etag = hdr($inbox, 'etag');
$inbox304 = req('GET', '/me/conversations', null, $W1 + ['headers' => ['If-None-Match' => $etag]]);
check('inbox: ETag then 304 with no body', $inbox['status'] === 200 && $etag !== '' && $inbox304['status'] === 304 && $inbox304['raw'] === '', $etag . ' ' . desc($inbox304));
check('inbox: unread counts', (static function () use ($inbox, $cWW): bool {
    foreach ((array) (data($inbox)['items'] ?? []) as $c) {
        if ($c['id'] === $cWW) {
            return $c['unread'] === 0 && ($c['last_message']['from_me'] ?? null) === true;
        }
    }
    return false;
})(), desc($inbox));
$y = req('POST', "/me/conversations/{$cWW}/messages", ['body' => 'رسالة جديدة'], $W2);
$inbox2 = req('GET', '/me/conversations', null, $W1 + ['headers' => ['If-None-Match' => $etag]]);
$since = req('GET', '/me/conversations?since=' . urlencode((string) (data($inbox)['server_time'] ?? '')), null, $W1);
check('inbox: a new message changes the ETag (200), ?since= returns only that conversation (+ ids)', $inbox2['status'] === 200
    && array_column((array) (data($since)['items'] ?? []), 'id') === [$cWW] && in_array($cWW, (array) (data($since)['ids'] ?? []), true), desc($since));
check('DM push to W1 (APNs, collapse id per conversation)', count(array_filter($pushes('apns_send'), static fn ($p) => ($p['headers']['apns-collapse-id'] ?? '') === 'dm-' . $cWW)) >= 1);

// ── Deletion for both, report retention
$rep = req('POST', '/reports', ['target_type' => 'dm_message', 'target_id' => (int) (data($y)['message']['id'] ?? 0), 'reason' => 'harassment', 'details' => 'إزعاج'], $W1);
$repId = (int) (data($rep)['id'] ?? 0);
check('report a DM → 201', $rep['status'] === 201 && $repId > 0, desc($rep));
$yMid = (int) (data($y)['message']['id'] ?? 0);
$z = req('POST', "/me/conversations/{$cWW}/messages", ['body' => 'ستُحذف'], $W2);
$zMid = (int) (data($z)['message']['id'] ?? 0);
$del = req('DELETE', "/me/conversations/{$cWW}/messages/{$zMid}", null, $W1);
$w2msgs = array_column((array) (data(req('GET', "/me/conversations/{$cWW}/messages", null, $W2))['items'] ?? []), 'id');
check('delete a message (by the recipient) → gone for both and from the database', $del['status'] === 200 && !in_array($zMid, $w2msgs, true)
    && (int) $q1('SELECT COUNT(*) FROM dm_messages WHERE id = ?', [$zMid]) === 0, desc($del));
$delC = req('DELETE', "/me/conversations/{$cWW}", null, $W2);
check('delete the conversation → gone for both', $delC['status'] === 200 && req('GET', "/me/conversations/{$cWW}/messages", null, $W1)['status'] === 404
    && !in_array($cWW, array_column((array) (data(req('GET', '/me/conversations', null, $W1))['items'] ?? []), 'id'), true), desc($delC));
check('…but the reported message is kept (hidden) for the admins; the others are deleted', (int) $q1('SELECT COUNT(*) FROM dm_messages WHERE id = ? AND deleted_at IS NOT NULL', [$yMid]) === 1
    && (int) $q1('SELECT COUNT(*) FROM dm_messages WHERE conversation_id = ? OR (conversation_id IS NULL AND id <> ? AND recipient_id IN (?, ?) AND sender_id IN (?, ?))', [$cWW, $yMid, $W1['id'], $W2['id'], $W1['id'], $W2['id']]) === 0);
$ar = req('GET', '/admin/community/reports?type=dm_message', null, $tadm);
$arow = array_values(array_filter((array) (data($ar)['items'] ?? []), static fn ($x) => $x['id'] === $repId))[0] ?? [];
check('admin sees the report with snapshot + the kept message', ($arow['snapshot']['body'] ?? '') === 'رسالة جديدة' && ($arow['current']['body'] ?? '') === 'رسالة جديدة'
    && ($arow['reporter']['id'] ?? 0) === $W1['id'] && ($arow['target_user']['id'] ?? 0) === $W2['id'], json_encode($arow, JSON_UNESCAPED_UNICODE));
$dec = req('POST', "/admin/community/reports/{$repId}/decision", ['action' => 'delete_content', 'note' => 'حذف'], $tadm);
check('admin decision delete_content → message deleted, report actioned, audit logged', $dec['status'] === 200 && (data($dec)['status'] ?? '') === 'actioned'
    && (int) $q1('SELECT COUNT(*) FROM dm_messages WHERE id = ?', [$yMid]) === 0
    && (int) $q1("SELECT COUNT(*) FROM admin_log WHERE action = 'community.report.delete_content' AND target LIKE ?", ['report:' . $repId . '%']) === 1, desc($dec));

// ── Room chat: stored + broadcast, reported lines survive the close
$ch1 = req('POST', "/rooms/{$B}/chat", ['body' => 'بارك الله فيكم'], $W1);
$ch2 = req('POST', "/rooms/{$B}/chat", ['body' => 'رسالة سيُبلّغ عنها'], $M2);
$chLink = req('POST', "/rooms/{$B}/chat", ['body' => 'www.spam.com'], $M2);
check('room chat stored + broadcast (SendData topic chat); links refused', $ch1['status'] === 201 && $ch2['status'] === 201 && $chLink['status'] === 422
    && count(array_filter($lkCalls('SendData'), static fn ($c) => ($c['body']['topic'] ?? '') === 'chat'
        && str_contains((string) base64_decode((string) ($c['body']['data'] ?? '')), 'بارك الله فيكم'))) === 1, desc($ch1));
$notIn = req('POST', "/rooms/{$B}/chat", ['body' => 'مرحبا'], $newcomer);
check('chat requires being in the room', $notIn['status'] === 404, desc($notIn));
$rm = req('POST', '/reports', ['target_type' => 'room_message', 'target_id' => (int) (data($ch2)['id'] ?? 0), 'reason' => 'spam'], $W1);
check('report a room message → 201', $rm['status'] === 201, desc($rm));
$chat = req('GET', "/rooms/{$B}/chat", null, $W1);
check('GET chat has join lines + messages', in_array('join', array_column((array) (data($chat)['items'] ?? []), 'event'), true) && count((array) (data($chat)['items'] ?? [])) >= 6, desc($chat));
req('POST', "/rooms/{$B}/leave", ['quiet' => true], $M3);
req('POST', "/rooms/{$B}/leave", null, $W1);
$leaves = array_values(array_filter((array) (data(req('GET', "/rooms/{$B}/chat", null, $M1))['items'] ?? []), static fn ($m) => $m['event'] === 'leave'));
check('leave quietly: no line; normal leave: «غادر …» line', count($leaves) === 1 && str_contains((string) $leaves[0]['body'], 'فاطمة'), json_encode($leaves, JSON_UNESCAPED_UNICODE));

// ── Webhook
$whBody = json_encode(['event' => 'participant_left', 'room' => ['name' => 'nq-room-' . $B], 'participant' => ['identity' => (string) $M2['id']], 'id' => 'EV_1', 'createdAt' => (string) (time() + 5)]);
$whJwt = static function (string $body, string $secret, string $key, ?string $sha = null): string {
    $h = rtrim(strtr(base64_encode('{"alg":"HS256","typ":"JWT"}'), '+/', '-_'), '=');
    $c = rtrim(strtr(base64_encode((string) json_encode(['iss' => $key, 'nbf' => time() - 5, 'exp' => time() + 300, 'sha256' => $sha ?? base64_encode(hash('sha256', $body, true))])), '+/', '-_'), '=');
    return $h . '.' . $c . '.' . rtrim(strtr(base64_encode(hash_hmac('sha256', $h . '.' . $c, $secret, true)), '+/', '-_'), '=');
};
$wh0 = req('POST', '/livekit/webhook', null, ['client' => false, 'raw' => $whBody, 'ctype' => 'application/webhook+json']);
$wh1 = req('POST', '/livekit/webhook', null, ['client' => false, 'raw' => $whBody, 'ctype' => 'application/webhook+json', 'headers' => ['Authorization' => $whJwt($whBody, 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxx', $LK_KEY)]]);
$wh2 = req('POST', '/livekit/webhook', null, ['client' => false, 'raw' => $whBody, 'ctype' => 'application/webhook+json', 'headers' => ['Authorization' => $whJwt($whBody, $LK_SECRET, $LK_KEY, base64_encode(hash('sha256', 'other', true)))]]);
check('webhook: no / wrong signature / wrong body hash → 401', $wh0['status'] === 401 && $wh1['status'] === 401 && $wh2['status'] === 401, desc($wh0) . desc($wh1) . desc($wh2));
$wh3 = req('POST', '/livekit/webhook', null, ['client' => false, 'raw' => $whBody, 'ctype' => 'application/webhook+json', 'headers' => ['Authorization' => $whJwt($whBody, $LK_SECRET, $LK_KEY)]]);
check('webhook participant_left (no X-NQ-Client needed) → presence + counts updated', $wh3['status'] === 200 && (data($wh3)['handled'] ?? null) === true
    && (int) $q1('SELECT present FROM room_participants WHERE room_id = ? AND user_id = ?', [$B, $M2['id']]) === 0
    && (data(req('GET', "/rooms/{$B}", null, $M1))['speaker_count'] ?? -1) === 1, desc($wh3));
$whJ = json_encode(['event' => 'participant_joined', 'room' => ['name' => 'nq-room-' . $B], 'participant' => ['identity' => (string) $W2['id']], 'createdAt' => (string) time()]);
req('POST', '/livekit/webhook', null, ['client' => false, 'raw' => $whJ, 'ctype' => 'application/webhook+json', 'headers' => ['Authorization' => $whJwt($whJ, $LK_SECRET, $LK_KEY)]]);
check('webhook participant_joined for a kicked user → removed again, not counted present', (int) $q1('SELECT present FROM room_participants WHERE room_id = ? AND user_id = ?', [$B, $W2['id']]) === 0
    && count(array_filter($lkCalls('RemoveParticipant'), static fn ($c) => ($c['body']['identity'] ?? '') === (string) $W2['id'])) >= 2);

// ── Closing deletes the chat except reported lines
$reportedId = (int) (data($ch2)['id'] ?? 0);
$cl = req('DELETE', "/rooms/{$B}", null, $M1);
check('owner closes → chat deleted except the reported message; participants gone; LiveKit DeleteRoom', $cl['status'] === 200
    && (int) $q1('SELECT COUNT(*) FROM room_messages WHERE room_id = ?', [$B]) === 1 && (int) $q1('SELECT COUNT(*) FROM room_messages WHERE id = ?', [$reportedId]) === 1
    && (int) $q1('SELECT COUNT(*) FROM room_participants WHERE room_id = ?', [$B]) === 0
    && count(array_filter($lkCalls('DeleteRoom'), static fn ($c) => ($c['body']['room'] ?? '') === 'nq-room-' . $B)) === 1, desc($cl));
check('closed room is gone from lists (404)', req('GET', "/rooms/{$B}", null, $M1)['status'] === 404);

// ── Dictionary (severe / possible, evasion), Quran words forced to «possible»
$cache = $LOCAL . '/storage/cache/riwayat';
@mkdir($cache, 0700, true);
file_put_contents($cache . '/ara-quranuthmanihaf-62.json', json_encode(array_merge(array_fill(0, 4, 'آية'), ['مَثَلُ ٱلَّذِينَ حُمِّلُوا۟ ٱلتَّوْرَىٰةَ ثُمَّ لَمْ يَحْمِلُوهَا كَمَثَلِ ٱلْحِمَارِ يَحْمِلُ أَسْفَارًۢا']), JSON_UNESCAPED_UNICODE));
$dw1 = req('POST', '/admin/community/dictionary', ['word' => 'زبالة', 'level' => 'severe'], $tadm);
$dw2 = req('POST', '/admin/community/dictionary', ['word' => 'غبي', 'level' => 'possible'], $tadm);
$dw3 = req('POST', '/admin/community/dictionary', ['word' => 'حمار', 'level' => 'severe'], $tadm);
$dw4 = req('POST', '/admin/community/dictionary', ['word' => 'زبـالـة', 'level' => 'possible'], $tadm);
@unlink($cache . '/ara-quranuthmanihaf-62.json');
check('dictionary CRUD: add severe + possible; a word found in the Quran is saved as «possible»; duplicate form → 409', $dw1['status'] === 201 && $dw2['status'] === 201
    && (data($dw3)['level'] ?? '') === 'possible' && (data($dw3)['forced_possible'] ?? null) === true && $dw4['status'] === 409, desc($dw3) . ' / ' . desc($dw4));
$variants = ['يا زبالة', 'زبااااالة', 'ز ب ا ل ة', 'زَبَالَة', 'ز_ب_ا_ل_ة', 'ز.ب.ا.ل.ة', 'زبـــالة', 'zbala', 'ya zebala', 'z.b.a.l.a'];
$missed = [];
foreach ($variants as $v) {
    $t = req('POST', '/admin/community/dictionary/test', ['text' => $v], $tadm);
    if ((data($t)['match']['level'] ?? '') !== 'severe') {
        $missed[] = $v;
    }
}
check('evasion variants detected as severe (repeats, spaces, punctuation, diacritics, tatweel, Arabizi)', $missed === [], implode(' | ', $missed));
$clean = req('POST', '/admin/community/dictionary/test', ['text' => 'الحمد لله رب العالمين، بالة قماش'], $tadm);
$p7 = req('POST', '/admin/community/dictionary/test', ['text' => 'انت 7mar'], $tadm);
check('clean text passes; Franco «7mar» matches the (possible) word', $clean['status'] === 200 && array_key_exists('match', (array) data($clean)) && data($clean)['match'] === null && (data($p7)['match']['word'] ?? '') === 'حمار', desc($clean) . desc($p7));
$rD = req('POST', '/rooms', ['title' => 'غرفة مختلطة ثانية', 'gender_scope' => 'mixed'], $W1);
$D = (int) (data($rD)['id'] ?? 0);
req('POST', "/rooms/{$D}/join", null, $W1);
req('POST', "/rooms/{$D}/join", null, $M3);
$poss = req('POST', "/rooms/{$D}/chat", ['body' => 'انت غـبي'], $M3);
check('possible word in room chat → 422 content_review, not stored, report for admins', $poss['status'] === 422 && errc($poss) === 'content_review'
    && (int) $q1("SELECT COUNT(*) FROM room_messages WHERE room_id = ? AND kind = 'chat'", [$D]) === 0
    && (int) $q1("SELECT COUNT(*) FROM reports WHERE source = 'dictionary' AND level = 'possible' AND target_user_id = ?", [$M3['id']]) === 1, desc($poss));
$sev = req('POST', "/rooms/{$D}/chat", ['body' => 'يا ز ب ا ل ة'], $M3);
check('severe word → 403 community_suspended, not delivered, removed from the room', $sev['status'] === 403 && errc($sev) === 'community_suspended'
    && (int) $q1("SELECT COUNT(*) FROM room_messages WHERE room_id = ? AND kind = 'chat'", [$D]) === 0
    && (int) $q1('SELECT present FROM room_participants WHERE room_id = ? AND user_id = ?', [$D, $M3['id']]) === 0
    && count(array_filter($lkCalls('RemoveParticipant'), static fn ($c) => ($c['body']['identity'] ?? '') === (string) $M3['id'] && ($c['body']['room'] ?? '') === 'nq-room-' . $D)) === 1, desc($sev));
$after = req('GET', '/rooms', null, $M3);
check('…account suspended in the community until an admin decides; «suspension» notification', $after['status'] === 403 && errc($after) === 'community_suspended'
    && in_array('suspension:', $types(req('GET', '/me/notifications', null, $M3)), true), desc($after));
$sus = req('GET', '/admin/community/suspensions?source=dictionary', null, $tadm);
$srow = array_values(array_filter((array) (data($sus)['items'] ?? []), static fn ($x) => ($x['user']['id'] ?? 0) === $M3['id']))[0] ?? [];
check('admin: dictionary-suspended accounts with evidence', ($srow['source'] ?? '') === 'dictionary' && ($srow['evidence'][0]['body'] ?? '') === 'يا ز ب ا ل ة'
    && ($srow['evidence'][0]['level'] ?? '') === 'severe', json_encode($srow, JSON_UNESCAPED_UNICODE));
$react = req('POST', "/admin/community/suspensions/{$M3['id']}/reactivate", null, $tadm);
check('admin reactivates → community works again (audited)', $react['status'] === 200 && req('GET', '/rooms', null, $M3)['status'] === 200
    && (int) $q1("SELECT COUNT(*) FROM admin_log WHERE action = 'community.reactivate' AND target = ?", ['user:' . $M3['id']]) === 1, desc($react));
$pdm = req('POST', '/me/conversations', ['user_id' => $W1['id'], 'body' => 'يا غبي'], $W2);
check('possible word in a DM → 422 content_review (nothing delivered)', $pdm['status'] === 422 && errc($pdm) === 'content_review', desc($pdm));
$ttl = req('POST', '/rooms', ['title' => 'غرفة الغبي', 'gender_scope' => 'women'], $W2);
$gnm = req('POST', '/community/groups', ['name' => 'جروب زبالة', 'gender_scope' => 'women'], $W1);
check('dictionary also covers room titles (possible → 422) and group names (severe → 403)', $ttl['status'] === 422 && $gnm['status'] === 403 && errc($gnm) === 'community_suspended', desc($ttl) . desc($gnm));
req('POST', "/admin/community/suspensions/{$W1['id']}/reactivate", null, $tadm);
$lockS = req('POST', "/admin/community/suspensions/{$M3['id']}/lock", null, $tadm);
check('lock on an account without a suspension → 404', $lockS['status'] === 404, desc($lockS));

// ── Groups: visibility per gender, members-only rooms, permissions
$g1 = req('POST', '/community/groups', ['name' => 'حلقة الفجر', 'description' => 'مراجعة يومية', 'gender_scope' => 'men', 'privacy' => 'public'], $M2);
$G1 = (int) (data($g1)['id'] ?? 0);
check('M2 creates a men\'s public group (founder)', $g1['status'] === 201 && (data($g1)['my_role'] ?? '') === 'founder' && count((array) (data($g1)['my_perms'] ?? [])) === 6, desc($g1));
$wg = req('GET', '/community/groups', null, $W1);
check('a woman never sees a men\'s group (discover / by id)', !in_array($G1, array_column((array) (data($wg)['items'] ?? []), 'id'), true)
    && req('GET', "/community/groups/{$G1}", null, $W1)['status'] === 404, desc($wg));
$mg = req('GET', '/community/groups?q=' . urlencode('الفجر'), null, $M1);
check('«اكتشف الجروبات» lists it for men', in_array($G1, array_column((array) (data($mg)['items'] ?? []), 'id'), true), desc($mg));
$gj = req('POST', "/community/groups/{$G1}/join", null, $M1);
check('public group: join directly', $gj['status'] === 200 && (data($gj)['status'] ?? '') === 'member', desc($gj));
$gperm = req('POST', '/rooms', ['title' => 'غرفة الجروب', 'gender_scope' => 'men', 'group_id' => $G1], $M1);
check('a plain member cannot open group rooms → 403', $gperm['status'] === 403, desc($gperm));
$gmod = req('PUT', "/community/groups/{$G1}/moderators/{$M1['id']}", ['perms' => ['schedule_rooms']], $M2);
check('founder assigns a moderator with chosen permissions', $gmod['status'] === 200 && (data($gmod)['perms'] ?? []) === ['schedule_rooms'], desc($gmod));
$gopen = req('POST', '/rooms', ['title' => 'غرفة الجروب', 'gender_scope' => 'men', 'group_id' => $G1], $M1);
check('…«schedule rooms» does not allow opening now → 403', $gopen['status'] === 403, desc($gopen));
$gw = req('POST', '/rooms', ['title' => 'غرفة نسائية', 'gender_scope' => 'women', 'group_id' => $G1], $M2);
check('a men\'s group cannot open a women\'s room → 422', $gw['status'] === 422, desc($gw));
req('POST', "/community/groups/{$G1}/follow", null, $newcomer);
$gr = req('POST', '/rooms', ['title' => 'مدارسة الأعضاء', 'gender_scope' => 'men', 'group_id' => $G1, 'visibility' => 'group_members'], $M2);
$GR = (int) (data($gr)['id'] ?? 0);
check('members-only group room', $gr['status'] === 201 && (data($gr)['group']['id'] ?? 0) === $G1, desc($gr));
check('…visible to members («من جروباتي»), hidden from non-members of the same gender', in_array($GR, array_column((array) (data(req('GET', '/rooms?tab=groups', null, $M1))['items'] ?? []), 'id'), true)
    && !in_array($GR, array_column((array) (data(req('GET', '/rooms?tab=live', null, $M3))['items'] ?? []), 'id'), true)
    && req('GET', "/rooms/{$GR}", null, $M3)['status'] === 404);
check('…members notified «group_room»; a follower of the group (non-member) not, for members-only', in_array('group_room:' . $GR, $types(req('GET', '/me/notifications', null, $M1)), true)
    && !in_array('group_room:' . $GR, $types(req('GET', '/me/notifications', null, $newcomer)), true));
$gx = req('POST', '/rooms', ['title' => 'لقاء مفتوح', 'gender_scope' => 'mixed', 'group_id' => $G1], $M2);
$GX = (int) (data($gx)['id'] ?? 0);
$wgx = array_values(array_filter((array) (data(req('GET', '/rooms?tab=live', null, $W1))['items'] ?? []), static fn ($x) => $x['id'] === $GX))[0] ?? null;
check('a men\'s group may open a mixed room (decision #4): women see the room but not the group', $gx['status'] === 201 && $wgx !== null && $wgx['group'] === null, json_encode($wgx, JSON_UNESCAPED_UNICODE));
$g2 = req('POST', '/community/groups', ['name' => 'أخوات القرآن', 'gender_scope' => 'women', 'privacy' => 'private'], $W1);
$G2 = (int) (data($g2)['id'] ?? 0);
$g2j = req('POST', "/community/groups/{$G2}/join", null, $W2);
check('private group: join → request + «join_request» to the founder', (data($g2j)['status'] ?? '') === 'requested'
    && in_array('join_request:', $types(req('GET', '/me/notifications', null, $W1)), true), desc($g2j));
$g2m = req('GET', "/community/groups/{$G2}/members", null, $W2);
check('private group members list: members only (403)', $g2m['status'] === 403, desc($g2m));
$g2a = req('POST', "/community/groups/{$G2}/requests/{$W2['id']}/accept", null, $W1);
check('request accepted → member', $g2a['status'] === 200 && (data(req('GET', "/community/groups/{$G2}", null, $W2))['my_role'] ?? '') === 'member', desc($g2a));
$g2i = req('POST', "/community/groups/{$G2}/invites", ['user_id' => $M1['id']], $W1);
check('inviting a man to a women\'s group → 404/422 (not eligible)', in_array($g2i['status'], [404, 422], true), desc($g2i));
$tr = req('POST', "/community/groups/{$G2}/transfer", ['user_id' => $W2['id']], $W1);
check('founder transfers ownership; old founder stays moderator', $tr['status'] === 200 && (data($tr)['my_role'] ?? '') === 'moderator', desc($tr));
$gdel = req('DELETE', "/community/groups/{$G2}", null, $W1);
check('only the founder deletes a group → 403', $gdel['status'] === 403, desc($gdel));

// ── Blocks hide everything both ways
$bk = req('POST', "/people/{$M2['id']}/block", null, $W1);
check('block → profile 404 both ways; no DM; their rooms disappear', $bk['status'] === 200 && req('GET', "/people/{$W1['id']}", null, $M2)['status'] === 404
    && req('GET', "/people/{$M2['id']}", null, $W1)['status'] === 404 && req('GET', "/rooms/{$GX}", null, $W1)['status'] === 404
    && !in_array($D, array_column((array) (data(req('GET', '/rooms?tab=live', null, $M2))['items'] ?? []), 'id'), true)
    && $dm($M2, $W1, 'سلام')['status'] === 404);

// ── Limits (admin)
$ls = req('PUT', '/admin/community/settings', ['rooms' => ['max_listeners' => 1, 'max_concurrent' => 2]], $tadm);
$busy = req('POST', '/rooms', ['title' => 'غرفة زائدة', 'gender_scope' => 'men'], $newcomer);
check('admin room limits: concurrent rooms cap → 503 rooms_busy', $ls['status'] === 200 && (data($ls)['rooms']['max_concurrent'] ?? 0) === 2 && $busy['status'] === 503 && errc($busy) === 'rooms_busy', desc($busy));
$lsBad = req('PUT', '/admin/community/settings', ['rooms' => ['max_listeners' => 0]], $tadm);
check('room limits validated (bounds)', $lsBad['status'] === 422, desc($lsBad));
$first = req('POST', "/rooms/{$D}/join", null, $newcomer);
$full = req('POST', "/rooms/{$D}/join", null, $W2);
check('listener cap (1) → second listener 409 room_full; the owner is not counted', $first['status'] === 200 && $full['status'] === 409 && errc($full) === 'room_full', desc($full));
req('POST', "/rooms/{$D}/leave", ['quiet' => true], $newcomer);
req('PUT', '/admin/community/settings', ['rooms' => ['max_listeners' => 500, 'max_concurrent' => 20]], $tadm);

// ── Admin: live rooms (both genders), close now, corrections, photo removal, audit
$alr = req('GET', '/admin/community/rooms', null, $tadm);
$ids = array_column((array) (data($alr)['items'] ?? []), 'id');
check('admin live rooms list shows men\'s, women\'s and mixed rooms', in_array($A, $ids, true) && in_array($WR, $ids, true) && in_array($D, $ids, true), desc($alr));
$acl = req('DELETE', "/admin/community/rooms/{$WR}", null, $tadm);
check('admin closes a room now (audited)', $acl['status'] === 200 && (string) $q1('SELECT status FROM rooms WHERE id = ?', [$WR]) === 'closed'
    && (int) $q1("SELECT COUNT(*) FROM admin_log WHERE action = 'community.room.close' AND target = ?", ['room:' . $WR]) === 1, desc($acl));
$cor = req('PATCH', "/admin/community/users/{$LEG['id']}", ['gender' => 'female', 'birthdate' => '1985-03-03'], $tadm);
check('admin gender/birthdate correction (audited)', $cor['status'] === 200 && (data($cor)['gender'] ?? '') === 'female'
    && (int) $q1("SELECT COUNT(*) FROM admin_log WHERE action = 'community.user.correct' AND target LIKE ?", ['user:' . $LEG['id'] . '%']) === 1, desc($cor));
$prm = req('DELETE', "/admin/community/users/{$M1['id']}/photo", null, $tadm);
check('admin photo removal (audited)', $prm['status'] === 200 && (int) $q1("SELECT COUNT(*) FROM admin_log WHERE action = 'community.photo.remove'") === 1, desc($prm));
$rr = req('GET', '/admin/community/reports?type=room_message', null, $tadm);
$rrow = data($rr)['items'][0] ?? [];
check('reported room message still there for the admins after the room closed', ($rrow['current']['body'] ?? '') === 'رسالة سيُبلّغ عنها', json_encode($rrow, JSON_UNESCAPED_UNICODE));
$susp = req('POST', "/admin/community/reports/{$rrow['id']}/decision", ['action' => 'ban_rooms', 'duration_days' => 7, 'note' => 'إزعاج'], $tadm);
$m2j = req('POST', "/rooms/{$A}/join", null, $M2);
check('decision ban_rooms (7 days) → rooms refused with rooms_banned; profile still works', $susp['status'] === 200 && $m2j['status'] === 403 && errc($m2j) === 'rooms_banned'
    && req('GET', '/me/community-profile', null, $M2)['status'] === 200, desc($m2j));
$nonAdmin = req('GET', '/admin/community/reports', null, $M1);
check('non-admin → 403 on /admin/community/*', $nonAdmin['status'] === 403, desc($nonAdmin));

// ── Auto-close (no speakers for 10 min), reminders, push worker, dead tokens, muting
req('POST', "/rooms/{$C}/reminder", null, $newcomer);
$db->prepare('UPDATE rooms SET scheduled_at = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s', time() + 300), $C]);
$db->prepare('UPDATE rooms SET no_speaker_since = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s', time() - 660), $A]);
$db->prepare('INSERT INTO room_messages (room_id, user_id, kind, body, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())')->execute([$A, $M1['id'], 'chat', 'سطر']);
$deadFcm = 'dead-' . str_repeat('b', 40);
req('POST', '/me/devices', ['provider' => 'fcm', 'token' => $deadFcm], $newcomer + ['client' => 'app']);
$cli = [];
exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($LOCAL . '/tools/push-worker.php') . ' 2>&1', $cli, $cliStatus);
check('push-worker CLI runs', $cliStatus === 0 && str_contains(implode("\n", $cli), 'push: sent'), implode("\n", $cli));
check('auto-close: a room with nobody on stage for 10 min is closed and its chat deleted', (string) $q1('SELECT status FROM rooms WHERE id = ?', [$A]) === 'closed'
    && (string) $q1('SELECT close_reason FROM rooms WHERE id = ?', [$A]) === 'no_speakers' && (int) $q1('SELECT COUNT(*) FROM room_messages WHERE room_id = ?', [$A]) === 0);
check('«remind me»: 10-minute reminder sent', in_array('reminder_soon:' . $C, $types(req('GET', '/me/notifications', null, $newcomer)), true));
check('dead FCM token (UNREGISTERED) → device removed', (int) $q1('SELECT COUNT(*) FROM devices WHERE token = ?', [$deadFcm]) === 0);
$st = req('POST', "/rooms/{$C}/start", null, $M1);
check('owner starts the scheduled room → «reminder_started»', $st['status'] === 200 && (data($st)['status'] ?? '') === 'open'
    && in_array('reminder_started:' . $C, $types(req('GET', '/me/notifications', null, $newcomer)), true), desc($st));
$mute1 = req('PUT', '/me/notification-prefs', ['muted' => ['room_opened']], $W1);
$before = count($pushes('apns_send'));
req('POST', '/rooms', ['title' => 'غرفة بعد الكتم', 'gender_scope' => 'mixed'], $M1);
check('muted type: listed in-app, no push', $mute1['status'] === 200 && count($pushes('apns_send')) === $before
    && count(array_filter((array) (data($mute1)['types'] ?? []), static fn ($t) => $t['type'] === 'room_opened' && $t['muted'] === true)) === 1, desc($mute1));
$nn = req('GET', '/me/notifications', null, $W1);
$netag = hdr($nn, 'etag');
check('notifications ETag → 304', req('GET', '/me/notifications', null, $W1 + ['headers' => ['If-None-Match' => $netag]])['status'] === 304);
req('POST', '/me/notifications/read', ['all' => true], $W1);
check('mark all read → unread 0', (data(req('GET', '/me/notifications', null, $W1))['unread'] ?? -1) === 0);

// ── Account deletion: rooms closed, founded groups handed over
$delAcc = req('DELETE', '/auth/account', ['password' => 'community-pass-1'], $M2);
check('deleting an account closes its rooms and hands its groups to a moderator', $delAcc['status'] === 200
    && (string) $q1('SELECT status FROM rooms WHERE id = ?', [$GX]) === 'closed' && (int) $q1('SELECT founder_id FROM cgroups WHERE id = ?', [$G1]) === $M1['id'], desc($delAcc));
