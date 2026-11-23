<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Minimal SMTP client (RFC 5321) for sending one prepared MIME message.
 * Encryption: 'ssl' = implicit TLS (usually port 465), 'tls' = STARTTLS (usually 587), 'none'.
 * Certificates are always verified. Errors are thrown as \RuntimeException with an Arabic
 * message that includes the server's reply; the password never appears in messages or logs.
 */
final class Smtp
{
    private const TIMEOUT = 15;

    /** @var resource|null */
    private $fp = null;
    /** @var array<string,string> EHLO extensions: keyword => parameters */
    private array $ext = [];

    public function __construct(
        private string $host,
        private int $port,
        private string $encryption,
        private string $username = '',
        private string $password = '',
        private int $timeout = self::TIMEOUT,
    ) {
        if (!in_array($encryption, ['ssl', 'tls', 'none'], true)) {
            $this->encryption = 'tls';
        }
    }

    /** Build a client from the admin integration settings, or null when no host is set. */
    public static function fromIntegrations(): ?self
    {
        $host = trim(Integrations::get('smtp_host'));
        if ($host === '') {
            return null;
        }
        $port = (int) Integrations::get('smtp_port');
        $enc = Integrations::get('smtp_encryption');
        if (!in_array($enc, ['ssl', 'tls', 'none'], true)) {
            $enc = $port === 465 ? 'ssl' : 'tls';
        }
        if ($port < 1 || $port > 65535) {
            $port = match ($enc) { 'ssl' => 465, 'tls' => 587, default => 25 };
        }
        return new self($host, $port, $enc, Integrations::get('smtp_username'), Integrations::get('smtp_password'));
    }

    /**
     * Send $message (full headers + body) from $from to $to.
     * @throws \RuntimeException
     */
    public function send(string $from, string $to, string $message, string $heloDomain = ''): void
    {
        foreach ([$from, $to] as $addr) {
            if (!filter_var($addr, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>]/', $addr)) {
                throw new \RuntimeException('عنوان بريد غير صالح: ' . self::clean($addr));
            }
        }
        $helo = preg_replace('/[^A-Za-z0-9.-]/', '', $heloDomain) ?: 'localhost';
        try {
            $this->connect();
            $this->expect($this->read(), [220], 'رد غير متوقع من خادم SMTP عند الاتصال');
            $this->hello($helo);
            if ($this->encryption === 'tls') {
                if (!isset($this->ext['STARTTLS'])) {
                    throw new \RuntimeException('الخادم لا يدعم STARTTLS على المنفذ ' . $this->port . '. جرّب التشفير SSL على المنفذ 465.');
                }
                $this->command('STARTTLS', [220], 'رفض الخادم بدء التشفير (STARTTLS)');
                $method = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                    $method |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
                }
                error_clear_last();
                if (@stream_socket_enable_crypto($this->fp, true, $method) !== true) {
                    throw new \RuntimeException('فشل إنشاء اتصال مشفّر (TLS) مع الخادم. تأكد أن اسم الخادم يطابق شهادته. ' . self::lastPhpError());
                }
                $this->hello($helo);
            }
            if ($this->username !== '') {
                $this->authenticate();
            }
            $this->command('MAIL FROM:<' . $from . '>', [250], 'رفض الخادم عنوان المُرسِل');
            $this->command('RCPT TO:<' . $to . '>', [250, 251], 'رفض الخادم عنوان المستلم');
            $this->command('DATA', [354], 'رفض الخادم بدء إرسال الرسالة');
            $this->write(self::dotStuff($message) . "\r\n.\r\n");
            $this->expect($this->read(), [250], 'رفض الخادم الرسالة');
            try {
                $this->write("QUIT\r\n");
                $this->read();
            } catch (\RuntimeException) {
                // the message is accepted; a rude disconnect after QUIT is harmless
            }
        } catch (\RuntimeException $e) {
            if (is_resource($this->fp)) {
                @fwrite($this->fp, "QUIT\r\n"); // best effort, so the server can close the session cleanly
            }
            throw $e;
        } finally {
            if (is_resource($this->fp)) {
                fclose($this->fp);
            }
            $this->fp = null;
        }
    }

    private function connect(): void
    {
        $ctx = stream_context_create(['ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'allow_self_signed' => false,
            'peer_name' => $this->host,
            'SNI_enabled' => true,
        ]]);
        $remote = ($this->encryption === 'ssl' ? 'ssl://' : 'tcp://') . $this->host . ':' . $this->port;
        error_clear_last();
        $fp = @stream_socket_client($remote, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT, $ctx);
        if (!is_resource($fp)) {
            $why = self::clean((string) $errstr) ?: self::lastPhpError();
            throw new \RuntimeException('تعذّر الاتصال بخادم SMTP ' . self::clean($this->host) . ':' . $this->port
                . ($this->encryption === 'ssl' ? ' (SSL)' : '') . ($why !== '' ? ': ' . $why : '.'));
        }
        stream_set_timeout($fp, $this->timeout);
        $this->fp = $fp;
    }

    private function hello(string $helo): void
    {
        [$code, $lines] = $this->command('EHLO ' . $helo, null, '');
        if ($code !== 250) {
            // very old servers: fall back to HELO (no extensions, so no STARTTLS/AUTH)
            $this->command('HELO ' . $helo, [250], 'رفض الخادم التحية (EHLO/HELO)');
            $this->ext = [];
            return;
        }
        $this->ext = [];
        foreach (array_slice($lines, 1) as $l) {
            $l = trim($l);
            if (preg_match('/^AUTH[ =](.*)$/i', $l, $m)) {
                $this->ext['AUTH'] = trim(($this->ext['AUTH'] ?? '') . ' ' . strtoupper($m[1]));
                continue;
            }
            $parts = preg_split('/\s+/', $l, 2) ?: [''];
            $this->ext[strtoupper($parts[0])] = $parts[1] ?? '';
        }
    }

    private function authenticate(): void
    {
        $mechs = isset($this->ext['AUTH']) ? (preg_split('/\s+/', trim($this->ext['AUTH'])) ?: []) : [];
        $unknown = $mechs === [];
        $login = $unknown || in_array('LOGIN', $mechs);
        $plain = $unknown || in_array('PLAIN', $mechs);
        if (!$login && !$plain) {
            throw new \RuntimeException('الخادم لا يدعم طريقة تسجيل دخول مدعومة هنا (LOGIN أو PLAIN). الطرق المتاحة: ' . self::clean(implode(' ', $mechs)));
        }
        if ($login) {
            [$code, $lines] = $this->command('AUTH LOGIN', null, '');
            if ($code === 334) {
                [$code, $lines] = $this->command(base64_encode($this->username), [334], 'رفض الخادم اسم المستخدم');
                [$code, $lines] = $this->command(base64_encode($this->password), null, '');
                if ($code === 235) {
                    return;
                }
                throw new \RuntimeException('رفض الخادم تسجيل الدخول: ' . self::reply($code, $lines));
            }
            if (!$plain || !in_array($code, [500, 501, 502, 504], true)) {
                throw new \RuntimeException('رفض الخادم تسجيل الدخول: ' . self::reply($code, $lines));
            }
        }
        [$code, $lines] = $this->command('AUTH PLAIN ' . base64_encode("\0" . $this->username . "\0" . $this->password), null, '');
        if ($code !== 235) {
            throw new \RuntimeException('رفض الخادم تسجيل الدخول: ' . self::reply($code, $lines));
        }
    }

    /**
     * Send one command and read its reply. With $ok set, any other code throws "$what: <reply>".
     * Commands are never logged, so credentials sent here do not leak.
     * @param list<int>|null $ok
     * @return array{0:int,1:list<string>}
     */
    private function command(string $cmd, ?array $ok, string $what): array
    {
        $this->write($cmd . "\r\n");
        $reply = $this->read();
        if ($ok !== null) {
            $this->expect($reply, $ok, $what);
        }
        return $reply;
    }

    /** @param array{0:int,1:list<string>} $reply @param list<int> $ok */
    private function expect(array $reply, array $ok, string $what): void
    {
        if (!in_array($reply[0], $ok, true)) {
            throw new \RuntimeException($what . ': ' . self::reply($reply[0], $reply[1]));
        }
    }

    private function write(string $data): void
    {
        $len = strlen($data);
        for ($done = 0; $done < $len;) {
            $n = @fwrite($this->fp, substr($data, $done, 8192));
            if ($n === false || $n === 0) {
                $this->failIfTimedOut();
                throw new \RuntimeException('انقطع الاتصال بخادم SMTP أثناء الإرسال.');
            }
            $done += $n;
        }
    }

    /** Read a (possibly multi-line) reply. @return array{0:int,1:list<string>} */
    private function read(): array
    {
        $lines = [];
        for ($i = 0; $i < 200; $i++) {
            $line = @fgets($this->fp, 4096);
            if ($line === false) {
                $this->failIfTimedOut();
                throw new \RuntimeException('أغلق خادم SMTP الاتصال دون رد.');
            }
            $line = rtrim($line, "\r\n");
            if (!preg_match('/^(\d{3})([ -]?)(.*)$/', $line, $m)) {
                throw new \RuntimeException('رد غير مفهوم من خادم SMTP: ' . self::clean($line));
            }
            $lines[] = $m[3];
            if ($m[2] !== '-') {
                return [(int) $m[1], $lines];
            }
        }
        throw new \RuntimeException('رد طويل جداً من خادم SMTP.');
    }

    private function failIfTimedOut(): void
    {
        $meta = is_resource($this->fp) ? stream_get_meta_data($this->fp) : [];
        if (!empty($meta['timed_out'])) {
            throw new \RuntimeException('انتهت مهلة الاتصال بخادم SMTP (' . $this->timeout . ' ثانية).');
        }
    }

    /** CRLF line endings and dot-stuffing (RFC 5321 §4.5.2); no trailing line break. */
    public static function dotStuff(string $message): string
    {
        $m = (string) preg_replace('/\r\n|\r|\n/', "\r\n", $message);
        $m = (string) preg_replace('/^\./m', '..', $m);
        return rtrim($m, "\r\n");
    }

    /** @param list<string> $lines */
    private static function reply(int $code, array $lines): string
    {
        return self::clean($code . ' ' . implode(' ', $lines));
    }

    private static function clean(string $s): string
    {
        $s = trim((string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', $s));
        return mb_strlen($s) > 300 ? mb_substr($s, 0, 300) . '…' : $s;
    }

    private static function lastPhpError(): string
    {
        $err = error_get_last();
        if ($err === null) {
            return '';
        }
        return self::clean((string) preg_replace('/^stream_socket_\w+\(\):\s*/', '', (string) $err['message']));
    }
}
