<?php
declare(strict_types=1);

// Noor Al-Quran API — one-time installer. Refuses to run once config.php exists.

$nqApp = null;
foreach ([dirname(__DIR__) . '/app', dirname(__DIR__, 2) . '/nuralquran-api/app'] as $nqCandidate) {
    if (is_file($nqCandidate . '/bootstrap.php')) {
        $nqApp = $nqCandidate;
        break;
    }
}

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
header('Cache-Control: no-store');

/** Render the page and stop. */
function nq_page(string $title, string $body): never
{
    echo '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title><style>'
        . 'body{font-family:Tahoma,Arial,sans-serif;background:#f4f3ee;margin:0;padding:24px 16px;color:#1d2a22;line-height:1.7}'
        . '.card{max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.06)}'
        . 'h1{color:#1f7a4d;font-size:24px;margin-top:0}h2{font-size:17px;margin:22px 0 8px;color:#1f7a4d}'
        . 'label{display:block;margin:12px 0 4px;font-weight:bold;font-size:14px}'
        . 'input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ccd;border-radius:8px;font-size:15px;direction:ltr;text-align:left}'
        . 'input.rtl{direction:rtl;text-align:right}button{margin-top:22px;width:100%;padding:12px;background:#1f7a4d;color:#fff;border:0;border-radius:8px;font-size:16px;cursor:pointer}'
        . '.err{background:#fdecea;color:#8a1c1c;padding:10px 14px;border-radius:8px;margin:12px 0}.ok{background:#e7f6ec;color:#185c38;padding:10px 14px;border-radius:8px}'
        . '.f{color:#8a1c1c;font-size:13px}.hint{color:#667;font-size:13px}code{direction:ltr;unicode-bidi:embed;background:#f1f1ec;padding:1px 5px;border-radius:4px}'
        . '</style></head><body><div class="card">' . $body . '</div></body></html>';
    exit;
}

function nq_e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

if ($nqApp === null) {
    http_response_code(500);
    nq_page('خطأ في التثبيت', '<h1>لم يتم العثور على ملفات التطبيق</h1><p>ارفع المجلد <code>nuralquran-api</code> (الذي يحتوي على <code>app</code> و <code>schema.sql</code>) إلى المجلد الرئيسي لحسابك خارج <code>public_html</code>، ثم أعد فتح هذه الصفحة.</p>');
}

require $nqApp . '/bootstrap.php';

if (file_exists(nq_config_path())) {
    http_response_code(403);
    nq_page('مُثبّت مسبقاً', '<h1>التطبيق مُثبّت مسبقاً</h1><p>تم تثبيت الخادم من قبل، ولا يمكن تشغيل التثبيت مرة أخرى.</p>');
}

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') === '443');
$cookieName = 'nq_install';
$errors = [];
$message = null;
$old = ['db_name' => '', 'db_user' => '', 'admin_name' => '', 'admin_email' => ''];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $cookie = (string) ($_COOKIE[$cookieName] ?? '');
    $field = (string) ($_POST['csrf'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $cookie) || !hash_equals($cookie, $field)) {
        $message = 'انتهت صلاحية النموذج. أعد تحميل الصفحة وحاول مرة أخرى.';
    } else {
        $in = [];
        foreach (['db_name', 'db_user', 'db_pass', 'admin_name', 'admin_email', 'admin_password', 'admin_password2'] as $k) {
            $in[$k] = is_string($_POST[$k] ?? null) ? $_POST[$k] : '';
        }
        foreach ($old as $k => $_) {
            $old[$k] = $in[$k];
        }
        $errors = NQ\Core\Installer::validate($in);
        if ($errors === []) {
            $message = NQ\Core\Installer::run($in, nq_base_dir());
            if ($message === null) {
                setcookie($cookieName, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
                nq_page('تم التثبيت', '<h1>تم التثبيت بنجاح ✓</h1>'
                    . '<p class="ok">تم إنشاء قاعدة البيانات وحساب المشرف <b>' . nq_e(mb_strtolower(trim($in['admin_email']))) . '</b>.</p>'
                    . '<h2>الخطوات التالية</h2><ol>'
                    . '<li>افتح الموقع وسجّل الدخول بحساب المشرف، ثم ادخل إلى لوحة الإدارة.</li>'
                    . '<li>من «التكاملات» أضف مفاتيح Google والمساعد وعنوان المرسل للبريد (اختياري).</li>'
                    . '<li>تحقق من أن <code>/v1/health</code> يعمل: <code>https://api.nuralquran.net/v1/health</code></li>'
                    . '<li>يمكنك (اختيارياً) حذف ملف <code>install.php</code> — لن يعمل مرة أخرى على أي حال.</li></ol>');
            }
        }
    }
}

$token = bin2hex(random_bytes(32));
setcookie($cookieName, $token, ['expires' => time() + 1800, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);

$err = static fn (string $k): string => isset($errors[$k]) ? '<div class="f">' . nq_e($errors[$k]) . '</div>' : '';
$html = '<h1>تثبيت خادم نور القرآن</h1>'
    . '<p class="hint">املأ البيانات التالية مرة واحدة فقط. أنشئ قاعدة البيانات والمستخدم أولاً من cPanel ← MySQL® Databases وامنح المستخدم كل الصلاحيات.</p>'
    . ($message !== null ? '<div class="err">' . nq_e($message) . '</div>' : '')
    . ($errors !== [] ? '<div class="err">يرجى تصحيح الحقول المشار إليها.</div>' : '')
    . '<form method="post" action="install.php" autocomplete="off">'
    . '<input type="hidden" name="csrf" value="' . $token . '">'
    . '<h2>قاعدة البيانات (localhost)</h2>'
    . '<label for="db_name">اسم قاعدة البيانات</label><input id="db_name" name="db_name" required placeholder="nuralqur_quran" value="' . nq_e($old['db_name']) . '">' . $err('db_name')
    . '<label for="db_user">اسم مستخدم قاعدة البيانات</label><input id="db_user" name="db_user" required placeholder="nuralqur_api" value="' . nq_e($old['db_user']) . '">' . $err('db_user')
    . '<label for="db_pass">كلمة مرور قاعدة البيانات</label><input id="db_pass" name="db_pass" type="password">' . $err('db_pass')
    . '<h2>حساب المشرف الأول</h2>'
    . '<label for="admin_name">الاسم</label><input class="rtl" id="admin_name" name="admin_name" required maxlength="100" value="' . nq_e($old['admin_name']) . '">' . $err('admin_name')
    . '<label for="admin_email">البريد الإلكتروني</label><input id="admin_email" name="admin_email" type="email" required value="' . nq_e($old['admin_email']) . '">' . $err('admin_email')
    . '<label for="admin_password">كلمة المرور (8 أحرف على الأقل)</label><input id="admin_password" name="admin_password" type="password" required minlength="8">' . $err('admin_password')
    . '<label for="admin_password2">تأكيد كلمة المرور</label><input id="admin_password2" name="admin_password2" type="password" required minlength="8">' . $err('admin_password2')
    . '<button type="submit">تثبيت</button></form>';
nq_page('تثبيت نور القرآن', $html);
