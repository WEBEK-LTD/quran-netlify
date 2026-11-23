<?php
declare(strict_types=1);

namespace NQ\Core;

/** First-run installer used by public/install.php. */
final class Installer
{
    /** @return array<string,mixed> */
    public static function defaultConfig(): array
    {
        return [
            'db' => ['host' => 'localhost', 'name' => '', 'user' => '', 'pass' => '', 'charset' => 'utf8mb4'],
            'app_key' => '',
            'site_url' => 'https://nuralquran.net',
            'api_url' => 'https://api.nuralquran.net',
            'cookie_domain' => '.nuralquran.net',
            'cors_origins' => [
                'https://nuralquran.net',
                'https://www.nuralquran.net',
                'https://nur-alquran.netlify.app',
                'capacitor://localhost',
                'https://localhost',
                'http://localhost:3000',
                'http://localhost:5173',
            ],
            'mail_from' => 'no-reply@nuralquran.net',
            'mail_transport' => 'mail',
            'trust_proxy' => false,
        ];
    }

    /**
     * @param array<string,mixed> $in raw form input
     * @return array<string,string> field => error (empty on success)
     */
    public static function validate(array $in): array
    {
        $e = [];
        foreach (['db_name' => 'اسم قاعدة البيانات', 'db_user' => 'اسم مستخدم قاعدة البيانات'] as $k => $label) {
            $v = trim((string) ($in[$k] ?? ''));
            if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $v)) {
                $e[$k] = $label . ' مطلوب ويجب أن يحتوي على أحرف إنجليزية وأرقام و _ فقط.';
            }
        }
        if (strlen((string) ($in['db_pass'] ?? '')) > 200) {
            $e['db_pass'] = 'كلمة المرور طويلة جداً.';
        }
        $name = trim((string) ($in['admin_name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 100) {
            $e['admin_name'] = 'اسم المشرف مطلوب (حتى 100 حرف).';
        }
        $email = trim((string) ($in['admin_email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            $e['admin_email'] = 'البريد الإلكتروني غير صحيح.';
        }
        $pw = (string) ($in['admin_password'] ?? '');
        if (mb_strlen($pw) < 8) {
            $e['admin_password'] = 'كلمة المرور يجب ألا تقل عن 8 أحرف.';
        } elseif (strlen($pw) > 72) {
            $e['admin_password'] = 'كلمة المرور طويلة جداً.';
        } elseif (!hash_equals($pw, (string) ($in['admin_password2'] ?? ''))) {
            $e['admin_password2'] = 'كلمتا المرور غير متطابقتين.';
        }
        return $e;
    }

    /**
     * Run the installation. Returns an Arabic error message, or null on success.
     * @param array<string,mixed> $in
     */
    public static function run(array $in, string $baseDir): ?string
    {
        $configPath = $baseDir . '/config.php';
        if (file_exists($configPath)) {
            return 'التطبيق مُثبّت مسبقاً.';
        }
        $schema = $baseDir . '/schema.sql';
        if (!is_file($schema)) {
            return 'لم يتم العثور على ملف schema.sql بجانب مجلد app.';
        }
        if (!is_writable($baseDir)) {
            return 'لا يمكن الكتابة في المجلد ' . $baseDir . ' — تحقق من الصلاحيات.';
        }
        $cfg = self::defaultConfig();
        $cfg['db']['name'] = trim((string) $in['db_name']);
        $cfg['db']['user'] = trim((string) $in['db_user']);
        $cfg['db']['pass'] = (string) ($in['db_pass'] ?? '');

        try {
            $pdo = Db::connect($cfg['db']);
        } catch (\Throwable $e) {
            error_log('[nq] install: DB connection failed: ' . $e->getMessage());
            return 'تعذّر الاتصال بقاعدة البيانات. تأكد من اسم القاعدة واسم المستخدم وكلمة المرور، ومن إضافة المستخدم إلى القاعدة بكل الصلاحيات (ALL PRIVILEGES).';
        }

        try {
            Db::setPdo($pdo);
            Db::runSqlFile($pdo, $schema);
            Settings::seedDefaults();
            $email = mb_strtolower(trim((string) $in['admin_email']));
            $name = trim((string) $in['admin_name']);
            $hash = password_hash((string) $in['admin_password'], PASSWORD_DEFAULT);
            $existing = Db::value('SELECT id FROM users WHERE email = ?', [$email]);
            if ($existing !== null) {
                Db::exec(
                    'UPDATE users SET name = ?, password_hash = ?, is_admin = 1, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?',
                    [$name, $hash, Db::now(), Db::now(), (int) $existing]
                );
            } else {
                Db::insert(
                    'INSERT INTO users (email, name, password_hash, is_admin, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)',
                    [$email, $name, $hash, Db::now(), Db::now(), Db::now()]
                );
            }
        } catch (\Throwable $e) {
            error_log('[nq] install: schema/admin failed: ' . $e->getMessage());
            return 'تم الاتصال بقاعدة البيانات لكن فشل إنشاء الجداول. تأكد من منح المستخدم كل الصلاحيات (ALL PRIVILEGES) ثم أعد المحاولة.';
        }

        $cfg['app_key'] = base64_encode(random_bytes(32));
        $php = "<?php\n// Noor Al-Quran API configuration — written by install.php on " . gmdate('Y-m-d H:i:s') . " UTC.\n"
            . "// Keep this file private (0600). Never commit it.\nreturn " . var_export($cfg, true) . ";\n";
        $tmp = $configPath . '.tmp' . bin2hex(random_bytes(4));
        $old = umask(0077);
        try {
            if (file_put_contents($tmp, $php, LOCK_EX) === false) {
                return 'تعذّر كتابة ملف الإعدادات.';
            }
            @chmod($tmp, 0600);
            // link() fails if config.php already exists, so two concurrent installs cannot both win.
            if (!@link($tmp, $configPath)) {
                if (file_exists($configPath)) {
                    @unlink($tmp);
                    return 'التطبيق مُثبّت مسبقاً.';
                }
                if (!@rename($tmp, $configPath)) {
                    @unlink($tmp);
                    return 'تعذّر كتابة ملف الإعدادات.';
                }
            } else {
                @unlink($tmp);
            }
            @chmod($configPath, 0600);
        } finally {
            umask($old);
        }
        return null;
    }
}
