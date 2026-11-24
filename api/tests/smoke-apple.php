<?php
declare(strict_types=1);

/**
 * Sign in with Apple checks — included by smoke.php (uses its req()/check()/data()/errc()/desc()/pdo()/mails() helpers,
 * $tadm, $run, $LOCAL, $opt). Needs --local and --fake-upstream: tests/fake-upstream.php serves Apple's JWKS
 * (the test RSA key made here), token and revoke endpoints; config.php's apple_auth_url points at it.
 */

/** @var array<string,mixed> $opt */
/** @var array<string,mixed> $tadm */
/** @var string $run */
/** @var string|null $LOCAL */

section('Sign in with Apple');
if ($LOCAL === null || !isset($opt['fake-upstream'])) {
    echo "  (Apple checks skipped — pass --local and --fake-upstream)\n";
    return;
}
$FAKE = rtrim((string) $opt['fake-upstream'], '/');
$fakeState = sys_get_temp_dir() . '/nq-fake-upstream-' . (string) parse_url($FAKE, PHP_URL_PORT);
@unlink($fakeState . '/apple.log');
@unlink($fakeState . '/apple-down');
@unlink($fakeState . '/apple-bad-client');
@unlink($LOCAL . '/storage/cache/apple/jwks.json');

// Runtime migration v5: an install from an older schema.sql gets the Apple columns + unique index on the next request
$db0 = pdo();
$db0->exec('ALTER TABLE users DROP INDEX uq_users_apple_sub, DROP COLUMN apple_refresh_token, DROP COLUMN apple_sub');
array_map('unlink', glob($LOCAL . '/storage/schema-*.version') ?: []);
req('GET', '/health');
$cols = $db0->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME LIKE 'apple%'")->fetchAll(PDO::FETCH_COLUMN);
$idx = (int) $db0->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_apple_sub' AND NON_UNIQUE = 0")->fetchColumn();
check('Migrations v5 adds users.apple_sub (unique) + apple_refresh_token', count($cols) === 2 && $idx === 1
    && (int) @file_get_contents((string) (glob($LOCAL . '/storage/schema-*.version')[0] ?? '')) === 5, json_encode($cols));

$b64u = static fn (string $raw): string => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
$unb64u = static fn (string $s): string => (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));

// Apple's signing key (stand-in) + its JWKS, and an attacker's key that claims the same kid
$KID = 'nqTestKid1';
$appleKey = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
$det = openssl_pkey_get_details($appleKey)['rsa'];
$otherKey = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
file_put_contents($fakeState . '/apple-jwks.json', json_encode(['keys' => [
    ['kty' => 'RSA', 'kid' => $KID, 'use' => 'sig', 'alg' => 'RS256', 'n' => $b64u($det['n']), 'e' => $b64u($det['e'])],
]]));
$cfgFile = $LOCAL . '/config.php';
$cfg = require $cfgFile;
$cfg['apple_auth_url'] = $FAKE . '/apple';
file_put_contents($cfgFile, "<?php\nreturn " . var_export($cfg, true) . ";\n");
chmod($cfgFile, 0600);
sleep(3); // let OPcache (revalidate_freq) see the rewritten config.php

/** RS256 JWT as Apple would sign it. */
$sign = static function (array $claims, $key = null, array $head = []) use ($b64u, $appleKey, $KID): string {
    $h = $b64u((string) json_encode($head + ['alg' => 'RS256', 'kid' => $KID]));
    $c = $b64u((string) json_encode($claims, JSON_UNESCAPED_SLASHES));
    openssl_sign($h . '.' . $c, $sig, $key ?? $appleKey, OPENSSL_ALGO_SHA256);
    return $h . '.' . $c . '.' . $b64u($sig);
};
$idToken = static function (string $sub, ?string $email, array $over = [], $key = null, array $head = []) use ($sign): string {
    $now = time();
    $c = ['iss' => 'https://appleid.apple.com', 'aud' => 'net.nuralquran.app', 'exp' => $now + 600, 'iat' => $now, 'sub' => $sub,
        'c_hash' => 'x', 'auth_time' => $now, 'nonce_supported' => true];
    if ($email !== null) {
        $c += ['email' => $email, 'email_verified' => 'true', 'is_private_email' => str_ends_with($email, '@privaterelay.appleid.com') ? 'true' : 'false'];
    }
    return $sign(array_merge($c, $over), $key, $head);
};
$notice = static function (string $type, string $sub, array $over = []) use ($sign): string {
    $now = time();
    return $sign(array_merge(['iss' => 'https://appleid.apple.com', 'aud' => 'net.nuralquran.app', 'iat' => $now, 'jti' => bin2hex(random_bytes(8)),
        'events' => json_encode(['type' => $type, 'sub' => $sub, 'event_time' => $now * 1000])], $over));
};
$appleCalls = static function (string $path) use ($fakeState): array {
    $out = [];
    foreach (is_file($fakeState . '/apple.log') ? (file($fakeState . '/apple.log') ?: []) : [] as $l) {
        $j = json_decode($l, true);
        if (is_array($j) && $j['path'] === '/apple' . $path) {
            $out[] = $j['form'];
        }
    }
    return $out;
};
$db = pdo();
$row = static function (int $id) use ($db): ?array {
    $st = $db->prepare('SELECT id, name, email, lang, apple_sub, apple_refresh_token, password_hash, google_sub, email_verified_at FROM users WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r === false ? null : $r;
};
$apple = static fn (array $body, string $ip, array $o = []): array => req('POST', '/auth/apple', $body, ['ip' => $ip, 'client' => 'app'] + $o);

// ── New account, then the same Apple ID again
$SUB1 = '001234.' . bin2hex(random_bytes(16)) . '.1234';
$E1 = "zaid+{$run}@example.com";
$a1 = $apple(['identity_token' => $idToken($SUB1, $E1), 'authorization_code' => 'good-1', 'given_name' => 'Zaid', 'family_name' => 'Test', 'lang' => 'en'], '10.80.0.1');
$u1 = (array) (data($a1)['user'] ?? []);
$U1 = (int) ($u1['id'] ?? 0);
check('apple: first sign-in creates the account (name from Apple, verified email, no password) and returns {user, token}', $a1['status'] === 200
    && $U1 > 0 && ($u1['name'] ?? '') === 'Zaid Test' && ($u1['email'] ?? '') === $E1 && ($u1['email_verified'] ?? null) === true
    && ($u1['has_password'] ?? null) === false && ($u1['lang'] ?? '') === 'en' && preg_match('/^[a-f0-9]{64}$/', (string) (data($a1)['token'] ?? '')) === 1, desc($a1));
$r1 = $row($U1);
check('apple: apple_sub stored; no key configured → no code exchange, no refresh token', ($r1['apple_sub'] ?? '') === $SUB1
    && $r1['apple_refresh_token'] === null && $appleCalls('/auth/token') === []);
check('apple: welcome email sent to the new account', count(mails($E1)) >= 1);
$me = req('GET', '/auth/me', null, ['token' => (string) (data($a1)['token'] ?? ''), 'ip' => '10.80.0.1']);
check('apple: the session token works (GET /auth/me)', $me['status'] === 200 && (int) (data($me)['user']['id'] ?? 0) === $U1, desc($me));
$a1b = $apple(['identity_token' => $idToken($SUB1, null), 'given_name' => 'Other', 'lang' => 'en'], '10.80.0.1');
check('apple: second sign-in (no email in the token) finds the same account by apple_sub; name unchanged', $a1b['status'] === 200
    && (int) (data($a1b)['user']['id'] ?? 0) === $U1 && (data($a1b)['user']['name'] ?? '') === 'Zaid Test', desc($a1b));

// ── Private relay address, no name shared
$SUB2 = '002345.' . bin2hex(random_bytes(16)) . '.2345';
$E2 = bin2hex(random_bytes(5)) . "{$run}@privaterelay.appleid.com";
$a2 = $apple(['identity_token' => $idToken($SUB2, $E2), 'lang' => 'ar'], '10.80.0.2');
$U2 = (int) (data($a2)['user']['id'] ?? 0);
check('apple: private relay email without a name → account named «قارئ»', $a2['status'] === 200 && $U2 > 0
    && (data($a2)['user']['name'] ?? '') === 'قارئ' && (data($a2)['user']['email'] ?? '') === $E2, desc($a2));

// ── An existing email/password account is linked by its (Apple-verified) email
$E3 = "linked+{$run}@example.com";
$s3 = req('POST', '/auth/signup', ['name' => 'Linked', 'email' => $E3, 'password' => 'linked-pass-1'], ['ip' => '10.80.0.3']);
$U3 = (int) (data($s3)['user']['id'] ?? 0);
$SUB3 = '003456.' . bin2hex(random_bytes(16)) . '.3456';
$a3 = $apple(['identity_token' => $idToken($SUB3, strtoupper($E3)), 'given_name' => 'Ignored'], '10.80.0.3');
check('apple: same email as an existing account → signs into it (linked), password kept, email now verified', $a3['status'] === 200
    && $U3 > 0 && (int) (data($a3)['user']['id'] ?? 0) === $U3 && (data($a3)['user']['name'] ?? '') === 'Linked'
    && (data($a3)['user']['has_password'] ?? null) === true && (data($a3)['user']['email_verified'] ?? null) === true
    && ($row($U3)['apple_sub'] ?? '') === $SUB3, desc($a3));
$SUB3b = '003457.' . bin2hex(random_bytes(16)) . '.3457';
$a3b = $apple(['identity_token' => $idToken($SUB3b, $E3)], '10.80.0.3');
check('apple: another Apple ID with an email already linked to a different Apple ID → 409', $a3b['status'] === 409 && errc($a3b) === 'apple_link_failed', desc($a3b));

// ── Rejected tokens
$bad = [
    'signature (another key, same kid)' => $idToken($SUB1, $E1, [], $otherKey),
    'audience' => $idToken($SUB1, $E1, ['aud' => 'com.example.other']),
    'issuer' => $idToken($SUB1, $E1, ['iss' => 'https://evil.example']),
    'expired' => $idToken($SUB1, $E1, ['iat' => time() - 7200, 'exp' => time() - 3600]),
    'issued in the future' => $idToken($SUB1, $E1, ['iat' => time() + 3600, 'exp' => time() + 4000]),
    'unknown kid' => $idToken($SUB1, $E1, [], null, ['kid' => 'nope']),
    'alg HS256' => (static function () use ($b64u, $SUB1, $KID): string {
        $h = $b64u('{"alg":"HS256","kid":"' . $KID . '"}');
        $c = $b64u((string) json_encode(['iss' => 'https://appleid.apple.com', 'aud' => 'net.nuralquran.app', 'iat' => time(), 'exp' => time() + 600, 'sub' => $SUB1]));
        return $h . '.' . $c . '.' . $b64u(hash_hmac('sha256', $h . '.' . $c, 'x', true));
    })(),
    'garbage' => 'not-a-jwt',
];
$i = 10;
foreach ($bad as $what => $tok) {
    $rb = $apple(['identity_token' => $tok], '10.81.0.' . $i++);
    check("apple: bad identity token ({$what}) → 401 apple_invalid_token", $rb['status'] === 401 && errc($rb) === 'apple_invalid_token', desc($rb));
}
$nonceTok = $idToken($SUB1, $E1, ['nonce' => hash('sha256', 'raw-nonce-1')]);
$n1 = $apple(['identity_token' => $nonceTok, 'nonce' => 'other-nonce'], '10.81.0.40');
$n2 = $apple(['identity_token' => $nonceTok], '10.81.0.41');
$n3 = $apple(['identity_token' => $nonceTok, 'nonce' => 'raw-nonce-1'], '10.81.0.42');
check('apple: a token carrying a nonce needs the matching raw nonce (wrong / missing → 401, right → 200)',
    $n1['status'] === 401 && $n2['status'] === 401 && $n3['status'] === 200 && (int) (data($n3)['user']['id'] ?? 0) === $U1, desc($n1) . ' / ' . desc($n3));
$m1 = $apple([], '10.81.0.43');
$m2 = $apple(['identity_token' => $idToken($SUB1, $E1), 'authorization_code' => 'bad code!'], '10.81.0.44');
check('apple: missing identity_token / malformed authorization_code → 422', $m1['status'] === 422 && $m2['status'] === 422, desc($m1) . ' / ' . desc($m2));
$SUB9 = '009999.' . bin2hex(random_bytes(16)) . '.9999';
$m3 = $apple(['identity_token' => $idToken($SUB9, null)], '10.81.0.45');
check('apple: a new Apple ID without an email → 422 apple_no_email (nothing created)', $m3['status'] === 422 && errc($m3) === 'apple_no_email', desc($m3));

// ── The Sign in with Apple key (admin → Integrations)
$ec = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
openssl_pkey_export($ec, $ecPem);
$ecPub = openssl_pkey_get_details($ec)['key'];
$t0 = req('POST', '/admin/integrations/test', ['target' => 'apple'], $tadm);
check('integration test «apple» without the key → ok false (explains what is missing)', $t0['status'] === 200 && (data($t0)['ok'] ?? null) === false, desc($t0));
$bk = req('PUT', '/admin/integrations', ['apple_signin_key_p8' => "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----"], $tadm);
$bt = req('PUT', '/admin/integrations', ['apple_signin_team_id' => 'team'], $tadm);
check('integrations: an invalid Apple .p8 / Team ID is refused (422)', $bk['status'] === 422 && $bt['status'] === 422, desc($bk) . ' / ' . desc($bt));
$ik = req('PUT', '/admin/integrations', ['apple_signin_team_id' => 'TEAM12345Z', 'apple_signin_key_id' => 'APPLEKEY12', 'apple_signin_key_p8' => $ecPem], $tadm);
$items = array_column((array) (data($ik)['items'] ?? []), null, 'key');
check('integrations: Apple key saved (secret never echoed); client id defaults to net.nuralquran.app', $ik['status'] === 200
    && !str_contains($ik['raw'], 'BEGIN PRIVATE KEY') && ($items['apple_signin_key_p8']['set'] ?? false) === true
    && ($items['apple_signin_key_p8']['secret'] ?? false) === true && isset($items['apple_signin_client_id']), desc($ik));
$t1 = req('POST', '/admin/integrations/test', ['target' => 'apple'], $tadm);
check('integration test «apple» → ok (Apple answers invalid_grant to a made-up code)', $t1['status'] === 200 && (data($t1)['ok'] ?? null) === true, desc($t1));
$cs = (string) (array_reverse($appleCalls('/auth/token'))[0]['client_secret'] ?? '');
$p = explode('.', $cs);
$csHead = json_decode($unb64u($p[0] ?? ''), true);
$csClaims = json_decode($unb64u($p[1] ?? ''), true);
$sigOk = count($p) === 3 && openssl_verify($p[0] . '.' . $p[1], (static function (string $raw): string {
    $enc = static function (string $i): string {
        $i = ltrim($i, "\0");
        if ($i === '' || (ord($i[0]) & 0x80)) {
            $i = "\0" . $i;
        }
        return "\x02" . chr(strlen($i)) . $i;
    };
    $seq = $enc(substr($raw, 0, 32)) . $enc(substr($raw, 32));
    return "\x30" . chr(strlen($seq)) . $seq;
})($unb64u($p[2] ?? '')), $ecPub, OPENSSL_ALGO_SHA256) === 1;
check('apple client secret: ES256 with the .p8 (kid = Key ID; iss = Team ID, sub = client id, aud = appleid.apple.com, short exp)', $sigOk
    && ($csHead['alg'] ?? '') === 'ES256' && ($csHead['kid'] ?? '') === 'APPLEKEY12' && ($csClaims['iss'] ?? '') === 'TEAM12345Z'
    && ($csClaims['sub'] ?? '') === 'net.nuralquran.app' && ($csClaims['aud'] ?? '') === 'https://appleid.apple.com'
    && (int) ($csClaims['exp'] ?? 0) > time() && (int) ($csClaims['exp'] ?? 0) <= time() + 86400 * 180, json_encode([$csHead, $csClaims]));
touch($fakeState . '/apple-bad-client');
$t2 = req('POST', '/admin/integrations/test', ['target' => 'apple'], $tadm);
check('integration test «apple» with a key Apple rejects (invalid_client) → ok false', $t2['status'] === 200 && (data($t2)['ok'] ?? null) === false
    && str_contains((string) (data($t2)['message'] ?? ''), 'invalid_client'), desc($t2));
@unlink($fakeState . '/apple-bad-client');

// ── With the key: the authorization code becomes a stored (encrypted) refresh token…
$a4 = $apple(['identity_token' => $idToken($SUB1, $E1), 'authorization_code' => 'good-2'], '10.80.0.1');
$r1 = $row($U1);
$tokCall = array_reverse($appleCalls('/auth/token'))[0] ?? [];
check('apple: with the key, sign-in exchanges the code (client_id, grant_type) and stores the refresh token encrypted', $a4['status'] === 200
    && ($tokCall['code'] ?? '') === 'good-2' && ($tokCall['client_id'] ?? '') === 'net.nuralquran.app' && ($tokCall['grant_type'] ?? '') === 'authorization_code'
    && is_string($r1['apple_refresh_token']) && $r1['apple_refresh_token'] !== '' && !str_contains($r1['apple_refresh_token'], 'rt-good-2'), desc($a4));
$a4b = $apple(['identity_token' => $idToken($SUB2, $E2), 'authorization_code' => 'nq-connectivity-test'], '10.80.0.2');
check('apple: a failed code exchange does not block sign-in', $a4b['status'] === 200 && (int) (data($a4b)['user']['id'] ?? 0) === $U2
    && $row($U2)['apple_refresh_token'] === null, desc($a4b));

// ── …which is revoked at Apple when the account is deleted
$tk1 = (string) (data($a4)['token'] ?? '');
$d1 = req('DELETE', '/auth/account', ['confirm' => 'DELETE'], ['token' => $tk1, 'ip' => '10.80.0.1', 'client' => 'app']);
$rev = array_reverse($appleCalls('/auth/revoke'))[0] ?? [];
check('apple: deleting the account revokes the Apple refresh token (token_type_hint=refresh_token) and deletes the row', in_array($d1['status'], [200, 204], true)
    && ($rev['token'] ?? '') === 'rt-good-2' && ($rev['token_type_hint'] ?? '') === 'refresh_token' && ($rev['client_id'] ?? '') === 'net.nuralquran.app'
    && is_string($rev['client_secret'] ?? null) && $row($U1) === null, desc($d1));
$SUB5 = '005678.' . bin2hex(random_bytes(16)) . '.5678';
$a5 = $apple(['identity_token' => $idToken($SUB5, "down+{$run}@example.com"), 'authorization_code' => 'good-5'], '10.80.0.5');
$U5 = (int) (data($a5)['user']['id'] ?? 0);
touch($fakeState . '/apple-down');
$before = count($appleCalls('/auth/revoke'));
$d5 = req('DELETE', '/auth/account', ['confirm' => 'DELETE'], ['token' => (string) (data($a5)['token'] ?? ''), 'ip' => '10.80.0.5', 'client' => 'app']);
check('apple: Apple failing to revoke never blocks the deletion', $U5 > 0 && in_array($d5['status'], [200, 204], true)
    && count($appleCalls('/auth/revoke')) === $before + 1 && $row($U5) === null, desc($d5));
@unlink($fakeState . '/apple-down');

// ── Server-to-server notifications (no X-NQ-Client, no session: authenticated by Apple's signature)
$note = static fn (string $payload, bool $form = false): array => req('POST', '/auth/apple/notifications', null, ['client' => false, 'ip' => '17.0.0.1']
    + ($form ? ['raw' => http_build_query(['payload' => $payload]), 'ctype' => 'application/x-www-form-urlencoded'] : ['raw' => json_encode(['payload' => $payload])]));
$nb1 = $note($sign(['iss' => 'https://appleid.apple.com', 'aud' => 'net.nuralquran.app', 'iat' => time(), 'events' => json_encode(['type' => 'consent-revoked', 'sub' => $SUB3])], $otherKey));
$nb2 = $note($notice('consent-revoked', $SUB3, ['aud' => 'com.example.other']));
$nb3 = req('POST', '/auth/apple/notifications', null, ['client' => false, 'raw' => '{}']);
check('apple notifications: bad signature / wrong audience / no payload → 400', $nb1['status'] === 400 && $nb2['status'] === 400 && $nb3['status'] === 400
    && $row($U3)['apple_sub'] === $SUB3, desc($nb1) . ' / ' . desc($nb3));
$ne = $note($notice('email-disabled', $SUB2));
check('apple notifications: email-disabled → 200, nothing changes', $ne['status'] === 200 && (data($ne)['handled'] ?? null) === true && $row($U2)['apple_sub'] === $SUB2, desc($ne));
$nc = $note($notice('consent-revoked', $SUB3), true);
$r3 = $row($U3);
check('apple notifications: consent-revoked (form body) → Apple unlinked, account kept', $nc['status'] === 200 && $r3 !== null
    && $r3['apple_sub'] === null && $r3['apple_refresh_token'] === null, desc($nc));
$a3c = $apple(['identity_token' => $idToken($SUB3, $E3)], '10.80.0.3');
check('apple: after consent-revoked, signing in with Apple again re-links by email', $a3c['status'] === 200 && (int) (data($a3c)['user']['id'] ?? 0) === $U3
    && $row($U3)['apple_sub'] === $SUB3, desc($a3c));
$nd = $note($notice('account-delete', $SUB3));
check('apple notifications: account-delete for an account that also has a password → unlinked, account kept', $nd['status'] === 200
    && $row($U3) !== null && $row($U3)['apple_sub'] === null, desc($nd));
$nd2 = $note($notice('account-delete', $SUB2));
check('apple notifications: account-delete for an Apple-only account → the account is deleted', $nd2['status'] === 200 && (data($nd2)['deleted'] ?? null) === true
    && $row($U2) === null, desc($nd2));
$nu = $note($notice('consent-revoked', 'no.such.sub'));
check('apple notifications: unknown Apple ID → 200 (handled false)', $nu['status'] === 200 && (data($nu)['handled'] ?? null) === false, desc($nu));

// ── Rate limit (per IP, like the other sign-in endpoints)
$codes = [];
for ($k = 0; $k < 11; $k++) {
    $codes[] = $apple(['identity_token' => 'not-a-jwt'], '10.82.0.1')['status'];
}
check('apple: sign-in rate limit → 11th attempt from one IP is 429', $codes[10] === 429 && !in_array(429, array_slice($codes, 0, 10), true), implode(',', $codes));
