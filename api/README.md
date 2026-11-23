# خادم نور القرآن (API) — دليل التثبيت

خادم بلغة PHP 8.2 مع قاعدة بيانات MySQL/MariaDB، يعمل على استضافة cPanel العادية بدون أي مكتبات إضافية.
العنوان النهائي: **`https://api.nuralquran.net/v1`** — والعقد الكامل بين الخادم والموقع في [`docs/API.md`](../docs/API.md).

## كيف تُرتَّب الملفات على الخادم

| من هذا المستودع | إلى الاستضافة | ملاحظات |
|---|---|---|
| محتويات `api/public/` (`index.php`, `install.php`, `.htaccess`, `.user.ini`) | `/home/nuralqur/public_html/api.nuralquran.net/` | الجذر العام للنطاق الفرعي. لا يوجد فيه أي سر. |
| `api/app/` و `api/schema.sql` | `/home/nuralqur/nuralquran-api/` | **خارج** `public_html` فلا يمكن فتحها من المتصفح. |
| (يُنشأ تلقائياً) `config.php` | `/home/nuralqur/nuralquran-api/config.php` | يكتبه `install.php` بصلاحيات 0600. لا ترفعه ولا تشاركه. |

بعد الرفع يجب أن يبدو المجلد الخاص هكذا:

```
/home/nuralqur/nuralquran-api/
├── app/
├── schema.sql
├── config.php      ← يظهر بعد التثبيت
└── storage/        ← يُنشأ تلقائياً: السجلات، وصور الملف الشخصي في storage/avatars (لا تحذفه عند التحديث)
```

## التثبيت لأول مرة (حوالي 10 دقائق)

1. **أنشئ النطاق الفرعي** — cPanel ← *Domains* (أو *Subdomains*) ← أنشئ `api.nuralquran.net`،
   واجعل الـ Document Root: `public_html/api.nuralquran.net` (المسار الكامل `/home/nuralqur/public_html/api.nuralquran.net`).
2. **فعّل شهادة SSL** — cPanel ← *SSL/TLS Status* ← *Run AutoSSL* وتأكد أن `api.nuralquran.net` أصبح باللون الأخضر.
3. **تأكد من إصدار PHP** — cPanel ← *MultiPHP Manager* (أو *Select PHP Version*) ← اختر **PHP 8.2** أو أحدث للنطاق الفرعي،
   وتأكد من تفعيل الإضافات: `pdo_mysql`, `curl`, `openssl`, `mbstring`, `json`، و **`gd`** (لصور الملف الشخصي، ويُفضّل أن يدعم WebP)،
   و `fileinfo` و `exif` (اختياريتان). إن لم تكن `gd` مفعّلة يعمل كل شيء ما عدا رفع الصور (يظهر «رفع الصور غير متاح على الخادم حالياً»).
4. **أنشئ قاعدة البيانات** — cPanel ← *MySQL® Databases*:
   - أنشئ قاعدة بيانات جديدة (مثلاً `nuralqur_quran`).
   - أنشئ مستخدماً جديداً بكلمة مرور قوية (مثلاً `nuralqur_api`). احفظ كلمة المرور.
   - في *Add User To Database* اختر المستخدم والقاعدة، ثم ضع علامة على **ALL PRIVILEGES** واحفظ.
   (الخادم يتصل عبر `localhost`، وهو الإعداد الافتراضي في cPanel.)
5. **ارفع الملفات** — cPanel ← *File Manager*:
   - ارفع محتويات `api/public/` إلى `public_html/api.nuralquran.net/`.
     ملف `.htaccess` مخفي؛ فعّل *Show Hidden Files* من *Settings* في File Manager للتأكد من رفعه.
   - أنشئ المجلد `/home/nuralqur/nuralquran-api` (بجانب `public_html` وليس داخله)، وارفع إليه المجلد `app` والملف `schema.sql`.
6. **شغّل التثبيت** — افتح في المتصفح: `https://api.nuralquran.net/install.php`
   واملأ: اسم قاعدة البيانات، اسم المستخدم، كلمة المرور، ثم اسم المشرف وبريده وكلمة مروره (8 أحرف على الأقل)، واضغط «تثبيت».
   سيقوم المثبّت باختبار الاتصال، وإنشاء الجداول، وإنشاء حساب المشرف، وكتابة `config.php` مع مفتاح تشفير عشوائي.
7. **تحقق** — افتح `https://api.nuralquran.net/v1/health` ويجب أن ترى: `{"ok":true,"data":{"status":"ok","db":true}}`.

انتهى! بعد ذلك لن تعمل صفحة `install.php` مرة أخرى (تعرض «مُثبّت مسبقاً»)، ويمكنك حذفها إن أردت.

### بعد التثبيت (من لوحة الإدارة في الموقع)

- **التكاملات**: أضف مفاتيح الذكاء الاصطناعي (Anthropic أو OpenAI) ومفاتيح Google وعنوان مرسل البريد. تُحفظ المفاتيح السرية مشفّرة ولا تُعرض مرة أخرى.
- **تسجيل الدخول بـ Google**: في Google Cloud Console أنشئ «OAuth client ID» من نوع *Web application*، وأضف في
  *Authorized redirect URIs*: `https://api.nuralquran.net/v1/auth/google/callback` ثم انسخ Client ID و Client Secret إلى التكاملات، واضغط «اختبار».
- **البريد**: يُرسل افتراضياً عبر `mail()` الخاص بالاستضافة، أو عبر **SMTP** إن اخترت ذلك في التكاملات («طريقة الإرسال»).
  لصندوق بريد من cPanel (*Email Accounts*): الخادم `mail.nuralquran.net`، المنفذ `465` مع `SSL` (أو `587` مع `TLS`)،
  واسم المستخدم هو عنوان البريد كاملاً، واجعل «عنوان المرسل» هو نفس العنوان. اضغط «اختبار» فتصلك رسالة تجريبية بالتصميم الكامل،
  وإن فشل الإرسال يظهر رد الخادم (مثل `535` عند خطأ كلمة المرور).
  يُفضّل أن يكون عنوان المرسل على نفس النطاق (مثل `no-reply@nuralquran.net`)،
  وتأكد من تفعيل *Email Deliverability* (SPF/DKIM) في cPanel حتى لا تذهب الرسائل إلى «الرسائل المزعجة».
- **صور الرسائل وخطوطها**: تُحمَّل من `https://api.nuralquran.net/email/` (الصور، وخطوط الموقع في `email/fonts/`)، فهي تُرفع مع محتويات `api/public/`.
- **لغة الرسائل**: تُرسل كل رسالة بلغة حساب المستخدم (العربية، English، Türkçe، Français، اردو، Indonesia) حسب لغة الواجهة عند التسجيل أو الدخول أو تغيير اللغة.

### الغرف الصوتية والمجتمع

- خادم الصوت (LiveKit) يُثبّت مرة واحدة على نفس الخادم: اتبع [`deploy/livekit/README.md`](../deploy/livekit/README.md)
  (سجل DNS لـ `rtc`، شهادة AutoSSL، `install.sh`)، ثم الصق في **التكاملات**: `livekit_url` و `livekit_api_url`
  و `livekit_api_key` و `livekit_api_secret` واضغط «اختبار».
- **الإشعارات:** في التكاملات الصق ملف حساب الخدمة من Firebase (JSON كاملاً) لأندرويد، ومفتاح Apple ‏`.p8` مع
  Key ID و Team ID و Bundle ID لـ iOS، واضغط «اختبار» لكل منهما.
- ارفع `api/tools/push-worker.php` إلى `/home/nuralqur/nuralquran-api/tools/`، وأضف في cPanel ← *Cron Jobs* (كل دقيقة):
  `/usr/local/bin/php /home/nuralqur/nuralquran-api/tools/push-worker.php --loop=55 --quiet >/dev/null 2>&1`
  — يرسل الإشعارات، ويغلق الغرف التي بقيت 10 دقائق بلا متحدث، ويرسل تذكير «ذكّرني». (الخادم يفعل ذلك أيضاً بعد الطلبات،
  لكن المهمة المجدولة تجعله لا يعتمد على الزيارات.)
- حدود الغرف (500 مستمع، 20 غرفة مفتوحة، 3 غرف لكل شخص، الإغلاق بعد 10 دقائق) والقاموس والبلاغات من لوحة الإدارة.
- الجداول الجديدة تُنشأ تلقائياً عند أول طلب بعد التحديث (`Migrations.php` يقرأ `schema.sql`، فارفعه مع `app`).

## التحديث لاحقاً

1. خذ نسخة احتياطية من قاعدة البيانات: cPanel ← *phpMyAdmin* ← اختر القاعدة ← *Export*.
2. ارفع المجلد `app` الجديد إلى `/home/nuralqur/nuralquran-api/` (استبدل القديم)، وكذلك `schema.sql`، ومحتويات `api/public/` إلى `public_html/api.nuralquran.net/`.
   **لا تحذف ولا تستبدل `config.php`** — فيه بيانات قاعدة البيانات ومفتاح التشفير (إن فُقد المفتاح يجب إعادة إدخال مفاتيح التكاملات).
3. إن احتوى التحديث على جداول جديدة: افتح phpMyAdmin ← اختر القاعدة ← *Import* ← اختر `schema.sql`.
   الملف آمن للتشغيل أكثر من مرة (يُنشئ الجداول والأعمدة الناقصة فقط ولا يمسّ البيانات).
   الأعمدة الجديدة تُضاف أيضاً تلقائياً عند أول طلب بعد التحديث (`app/Core/Migrations.php`)، فهذه الخطوة اختيارية لها.

### صور الملف الشخصي

- يرفع المستخدم صورته من صفحة الإعدادات (`POST /v1/me/avatar`). يقصّها الموقع ويصغّرها قبل الرفع، ثم يعيد الخادم ترميزها
  بنفسه (مربّع 512×512 بصيغة WebP أو JPEG) فلا يُحفظ الملف الأصلي ولا بياناته الوصفية (مثل موقع التصوير) أبداً.
- تُحفظ في `/home/nuralqur/nuralquran-api/storage/avatars/` (خارج `public_html`) وتُعرض عبر `https://api.nuralquran.net/v1/avatars/…`.
  عند تغيير الصورة أو حذفها أو حذف الحساب يُحذف الملف القديم. عند النقل لخادم آخر انسخ هذا المجلد مع قاعدة البيانات.
- الحد الأقصى 5 ميغابايت. ملف `.user.ini` المرفق يرفع `upload_max_filesize` إلى 6M و `post_max_size` إلى 8M (تقرؤه LiteSpeed/PHP-FPM
  خلال 5 دقائق تقريباً). إن ظهرت «حجم الصورة كبير جداً» لصور أصغر من 5 ميغابايت، اضبط القيمتين من cPanel ← *MultiPHP INI Editor*
  (أو *Select PHP Version* ← *Options*). بقية المسارات ما زالت ترفض أي طلب أكبر من 64 كيلوبايت.

### الروايات (صفحة «الإجازة والقراءات»)

- نصوص الروايات (حفص، شعبة، ورش، قالون، البزي، قنبل، الدوري، السوسي) تُجلب من نسخ مجمع الملك فهد المنشورة في مشروع
  fawazahmed0/quran-api عبر `GET /v1/riwayat/text/{edition}/{surah}`، وتُحفظ على الخادم في
  `/home/nuralqur/nuralquran-api/storage/cache/riwayat/` بلا انتهاء (لا تحذف هذا المجلد عند التحديث؛ إن حُذف يُعاد ملؤه تلقائياً).
- قائمة القرّاء لكل رواية تُجلب من mp3quran.net عبر `GET /v1/riwayat/audio` مرة كل 24 ساعة على الأكثر، وإن تعذّر التحديث تُعرض آخر نسخة محفوظة.
- ارفع الملف `api/tools/check-riwayat.php` إلى `/home/nuralqur/nuralquran-api/tools/` (بجانب `app`)، ثم من *Terminal* في cPanel شغّل:
  `php ~/nuralquran-api/tools/check-riwayat.php` — يطبع لكل راوٍ عدد القرّاء الذين وُجدوا ورابط MP3 تجريبياً مع حالته،
  وأسماء المصاحف التي لم تُطابق أي راوٍ، وحالة جلب سورة من كل نص. أضف `--refresh` لتحديث نسخة القرّاء المحفوظة فوراً.

## حل المشكلات

| المشكلة | الحل |
|---|---|
| «لم يتم العثور على ملفات التطبيق» | تأكد أن المسار هو `/home/nuralqur/nuralquran-api/app/bootstrap.php` بالضبط. |
| «تعذّر الاتصال بقاعدة البيانات» أثناء التثبيت | راجع الاسم الكامل للقاعدة والمستخدم (مع البادئة `nuralqur_`) وكلمة المرور، وأن المستخدم مضاف للقاعدة بـ ALL PRIVILEGES. |
| «لا يمكن الكتابة في المجلد» | اجعل صلاحيات `/home/nuralqur/nuralquran-api` على `755`. |
| خطأ 500 بعد التثبيت | سجل الأخطاء في `/home/nuralqur/nuralquran-api/storage/logs/php-error.log` (لا يظهر للزوار أبداً). |
| «رفع الصور غير متاح على الخادم حالياً» | فعّل إضافة `gd` من *Select PHP Version* ← *Extensions* (أو اطلب ذلك من الاستضافة). |
| الموقع لا يستطيع الاتصال (CORS) | عنوان الموقع يجب أن يكون ضمن `cors_origins` في `config.php`. |

## للمطوّرين

- البنية: `public/index.php` (نقطة الدخول) ← `app/Core/App.php` (الأمان، CORS، CSRF، الجلسات، وضع الصيانة) ← `app/routes.php` ← `app/Controllers/*`.
- لا Composer ولا مكتبات خارجية. الاستعلامات كلها Prepared Statements. الأسرار مشفّرة بـ AES-256-GCM.
- تشغيل محلي واختبار شامل (يحتاج MariaDB/MySQL محلياً):

```bash
DB_NAME=nq_test DB_USER=nq DB_PASS=nqpass123 api/tests/run-local.sh
```

  يُنشئ قاعدة بيانات جديدة، ويشغّل `php -S`، وينفّذ التثبيت عبر HTTP، ثم يشغّل `api/tests/smoke.php` (اختبار شامل لكل المسارات، ومنها رفع الصور ورفض الأنواع والأحجام غير المسموحة) ويحذف `config.php` المحلي في النهاية.
  يرفض العمل إن وُجد `api/config.php` (خادم محلي آخر يستخدمه)؛ عندها انسخ مجلد `api` إلى مكان مؤقت (بدون `config.php`) وشغّله من هناك مع `PORT=8097` مثلاً.
  يمكن أيضاً تشغيل `php api/tests/smoke.php --base=https://api.example.com` على خادم قائم (بدون `--local`).
  يشغّل السكربت أيضاً `api/tests/fake-upstream.php` على المنفذ `PORT+1` (أو `FAKE_PORT`) بديلاً محلياً لـ jsDelivr/GitHub/mp3quran
  ببيانات حقيقية من `api/tests/fixtures/`، فتُختبر مسارات `/v1/riwayat/*` وأداة `tools/check-riwayat.php` دون إنترنت.

- **تصميم الرسائل**: كل الرسائل تُبنى من قالب واحد في `app/Core/Mailer.php` (`Mailer::render()`). لمعاينتها دون إرسال:

```bash
php api/tests/email-preview.php                           # يكتب api/storage/mail/preview/<الرسالة>-<اللغة>.html و .txt بكل اللغات الست
php api/tests/email-preview.php --shots=/tmp/email-shots  # ولقطات شاشة لمجموعة ممثلة (يحتاج Playwright)؛ أضف --all لكل اللغات والأحجام
```

- **صور الرسائل** (`public/brand/email/*.png`) مولّدة من ملفات الشعار SVG. لإعادة توليدها بعد تعديل الشعار
  (يحتاج Node و Playwright مع Chromium، و ImageMagick اختيارياً لتصغير حجم الترويسة):

```bash
node api/tools/render-email-assets.js
```

  إن غيّرت الصور فارفع قيمة `ASSET_VERSION` في `Mailer.php` حتى لا تعرض برامج البريد النسخة القديمة من ذاكرتها.
