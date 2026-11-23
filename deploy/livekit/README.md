# LiveKit — الغرف الصوتية · Voice rooms (rtc.nuralquran.net)

خادم الصوت المباشر للغرف (بدون تسجيل) يعمل على نفس خادم cPanel/WHM ‏(CloudLinux 9، LiteSpeed، Imunify360) كخدمة
systemd مستقلة، محدودة بـ **4 أنوية و 4 GB** ذاكرة. موقع الخادم (API) يصدر رموز الدخول، ويستقبل أحداث LiveKit، ويرسل
الدردشة والتفاعلات بعد فحصها بالقاموس — انظر «Rooms & community» في [`docs/API.md`](../../docs/API.md).

*English version below.*

## القرار: كيف يصل التطبيق إلى LiveKit؟

LiteSpeed يحجز المنفذين 80 و 443 لكل مواقع cPanel، وخادم الإشارة في LiveKit ‏(7880) لا يقدّم TLS بنفسه بل يتوقع
وسيطاً أمامه. وتمرير WebSocket طويل العمر عبر LiteSpeed إلى منفذ محلي (`extprocessor` + `RewriteRule [P]` في ملفات
userdata) غير موثوق: LiteSpeed يقطع الاتصالات الخاملة، وكل إعادة تشغيل أو تحديث له (وهو يحدث مع تحديثات cPanel) يقطع
كل الغرف.

**الحل المختار:** خادم **Caddy** صغير كخدمة منفصلة يستمع على **TCP 7443** بشهادة AutoSSL الخاصة بـ `rtc.nuralquran.net`،
ويمرّر WebSocket إلى LiveKit على `127.0.0.1:7880` (المنفذ 7880 لا يُفتح في الجدار الناري أبداً).

```
التطبيق ──wss://rtc.nuralquran.net:7443──▶ Caddy (TLS) ──▶ 127.0.0.1:7880  LiveKit (الإشارة)
التطبيق ◀──── UDP 50000–60000 / TCP 7881 ────▶ LiveKit (الصوت WebRTC)
شبكات تمنع UDP ◀── TURN/TLS 5349 · TURN/UDP 3478 ──▶ LiveKit (TURN المدمج)
LiveKit ──https──▶ https://api.nuralquran.net/v1/livekit/webhook  (موقّع بالسر)
الخادم (PHP) ──http──▶ 127.0.0.1:7880  (أوامر الإدارة: كتم، إخراج، رفع للمنصة، إرسال الدردشة…)
```

- **الميزة:** مستقل تماماً عن LiteSpeed و cPanel (تحديثاتهما لا تقطع الغرف)، إعدادات قليلة وواضحة، والشهادة نفسها
  التي يجددها AutoSSL.
- **الثمن:** المنفذ 7443 ليس 443؛ بعض الشبكات المقيّدة جداً (تسمح بـ 443 فقط) قد تمنع الإشارة. الصوت نفسه له بدائل
  (TCP 7881 و TURN/TLS 5349). إن أصبح ذلك مشكلة لاحقاً: أضف عنوان IPv4 ثانياً للخادم، واجعل LiteSpeed يستمع على العنوان
  الأول فقط، ووجّه `rtc` إلى العنوان الثاني، وغيّر `rtc.nuralquran.net:7443` إلى `:443` في `Caddyfile` و `livekit_url`.
- **لماذا 50000–60000 وليس 50000–51000؟** كل مشارك يستخدم اتصالين (إرسال واستقبال)، فألف منفذ لا تكفي لغرفة من 500
  مستمع. المدى الأوسع لا يضر (الجدار الناري يفتح UDP لهذا المدى فقط).

## الخطوات (مرة واحدة، حوالي 20 دقيقة)

1. **DNS** — WHM ← *DNS Functions* ← *Edit DNS Zone* ← `nuralquran.net` (أو cPanel ← *Zone Editor*): أضف سجل
   **A** باسم `rtc` يشير إلى عنوان IPv4 للخادم (نفس عنوان `api`). تحقق: `dig +short rtc.nuralquran.net`.
2. **النطاق الفرعي والشهادة** — cPanel ← *Domains* ← *Create A New Domain* ← `rtc.nuralquran.net`
   (Document Root: `public_html/rtc.nuralquran.net`، يبقى فارغاً). ثم cPanel ← *SSL/TLS Status* ← *Run AutoSSL* حتى
   يظهر `rtc.nuralquran.net` باللون الأخضر. (LiteSpeed يعرض على 443 صفحة فارغة لهذا النطاق؛ هذا طبيعي وهو ما يسمح
   لـ AutoSSL بالتجديد.)
3. **ارفع هذا المجلد** إلى الخادم، مثلاً `/root/livekit-deploy/` (WHM ← *Terminal*، أو File Manager ثم انقل الملفات).
4. **ثبّت** — من WHM ← *Terminal* (root):
   ```bash
   cd /root/livekit-deploy && bash install.sh
   ```
   يقوم السكربت بـ: تنزيل LiveKit ‏(v1.8.4) و Caddy ‏(v2.10.0) بإصدارات مثبّتة والتحقق من **checksums** المنشورة لكل
   ملف (ويطبع SHA-256 لتحفظه وتثبّته لاحقاً: `LIVEKIT_SHA256=… bash install.sh`)، إنشاء مستخدم نظام `livekit`،
   **توليد مفتاح وسر LiveKit** في `/etc/livekit/keys.yaml` ‏(0600، لا يوضع في git أبداً)، نسخ شهادة AutoSSL،
   فتح المنافذ في CSF أو firewalld، وتشغيل الخدمات `livekit` و `caddy-rtc` ومؤقّت تجديد الشهادة.
   في النهاية يطبع **مرة واحدة**:
   ```
   livekit_url        = wss://rtc.nuralquran.net:7443
   livekit_api_url    = http://127.0.0.1:7880
   livekit_api_key    = API…
   livekit_api_secret = …
   ```
5. **التكاملات** — في لوحة الإدارة بالموقع ← *التكاملات*: الصق القيم الأربع، احفظ، ثم «اختبار» لـ LiveKit (يجب أن
   يظهر «تم الاتصال بخادم LiveKit»). لا تنسخ السر إلى أي ملف آخر. (لرؤيته لاحقاً: `cat /etc/livekit/keys.yaml`.)
6. **عامل الإشعارات** — cPanel ← *Cron Jobs* ← كل دقيقة:
   ```
   * * * * * /opt/cpanel/ea-php82/root/usr/bin/php /home/nuralqur/nuralquran-api/tools/push-worker.php --loop=55 --quiet >/dev/null 2>&1
   ```
   (يرسل إشعارات FCM/APNs، ويغلق الغرف التي بقيت 10 دقائق بلا متحدث، ويرسل تذكير «ذكّرني» قبل 10 دقائق.)
7. **اختبار** — `bash smoke-test.sh` (ولاختبار حمل قصير: `LOADTEST=1 bash smoke-test.sh` بعد تثبيت `lk`، انظر أدناه).

### الجدار الناري (يفعله `firewall.sh` تلقائياً)

| المنفذ | البروتوكول | الغرض |
|---|---|---|
| 7443 | TCP | ‏wss:// الإشارة (Caddy) |
| 7881 | TCP | ‏WebRTC عبر TCP |
| 50000–60000 | UDP | الصوت |
| 3478 | UDP | ‏TURN/UDP |
| 5349 | TCP | ‏TURN/TLS |
| 7880 | — | **مغلق** (محلي فقط) |

يدوياً — CSF: أضف `7443,7881,5349` إلى `TCP_IN` و `TCP6_IN`، و `3478,50000:60000` إلى `UDP_IN` و `UDP6_IN` في
`/etc/csf/csf.conf` ثم `csf -r`. أو firewalld:
```bash
firewall-cmd --permanent --add-port={7443,7881,5349}/tcp --add-port=3478/udp --add-port=50000-60000/udp && firewall-cmd --reload
```
Imunify360 بوضع `port_blocking_mode: ALLOW` لا يمنع المنافذ بنفسه (تحقق: `imunify360-agent config show | grep port_blocking_mode`
و `imunify360-agent blocked-port list`).

### تجديد الشهادة

AutoSSL يجدد شهادة `rtc.nuralquran.net` تلقائياً (لهذا يبقى النطاق الفرعي موجوداً في cPanel). المؤقّت
`livekit-cert-sync.timer` يعمل يومياً 04:20: ينسخ الشهادة من `/var/cpanel/ssl/apache_tls/rtc.nuralquran.net/combined`
إلى `/etc/livekit/tls/` إن تغيّرت، يتحقق من تطابق المفتاح والنطاق والصلاحية، ثم يعيد تشغيل Caddy و LiveKit (ثوانٍ،
في وقت قليل الاستخدام). يدوياً: `/opt/livekit/livekit-cert-sync.sh`. الحالة: `systemctl list-timers livekit-cert-sync`.

### الموارد والسجلات

- الحدود: `systemctl show livekit -p CPUQuotaPerSecUSec -p MemoryMax` (يجب أن يظهر `4s` و `4294967296`).
  LVE في CloudLinux يخص حسابات cPanel فقط، ولا يؤثر على هذه الخدمة.
- السجلات: `journalctl -u livekit -f` و `journalctl -u caddy-rtc -f`.
- الغرف المفتوحة الآن: لوحة الإدارة ← الغرف المباشرة (أو زر «اختبار» LiveKit).

### التحديث وتغيير المفاتيح

- **تحديث LiveKit:** `LIVEKIT_VERSION=1.x.y bash install.sh` (المفاتيح والشهادة تبقى؛ الغرف تنقطع لثوانٍ).
- **تغيير المفتاح/السر:** احذف `/etc/livekit/keys.yaml`، شغّل `bash install.sh`، والصق القيم الجديدة في التكاملات.

### اختبار الحمل (اختياري)

```bash
LK_CLI_VERSION=2.4.0   # github.com/livekit/livekit-cli/releases
cd /tmp && curl -fsSLO https://github.com/livekit/livekit-cli/releases/download/v$LK_CLI_VERSION/lk_${LK_CLI_VERSION}_linux_amd64.tar.gz \
  && curl -fsSLO https://github.com/livekit/livekit-cli/releases/download/v$LK_CLI_VERSION/checksums.txt \
  && grep " lk_${LK_CLI_VERSION}_linux_amd64.tar.gz\$" checksums.txt | sha256sum -c - \
  && tar -xzf lk_${LK_CLI_VERSION}_linux_amd64.tar.gz lk && install -m 0755 lk /usr/local/bin/lk
LOADTEST=1 bash /root/livekit-deploy/smoke-test.sh    # 1 متحدث + 20 مستمعاً لمدة 30 ثانية
```

### حل المشكلات

| المشكلة | الحل |
|---|---|
| `https://rtc.nuralquran.net:7443/` لا يفتح | `systemctl status caddy-rtc`، المنفذ 7443 في الجدار الناري، سجل `rtc` في DNS. |
| «No certificate for rtc…» | الخطوة 2 (النطاق الفرعي + AutoSSL) ثم `/opt/livekit/livekit-cert-sync.sh`. |
| الغرفة تفتح لكن لا صوت | منافذ UDP ‏50000–60000 و TCP ‏7881؛ `node_ip` في `/etc/livekit/livekit.yaml` = عنوان `rtc`. |
| زر «اختبار» LiveKit يفشل | `curl http://127.0.0.1:7880/` يجب أن يعيد `OK`؛ تطابق المفتاح/السر مع `keys.yaml`. |
| أحداث الدخول/الخروج لا تصل | `smoke-test.sh` قسم «webhook target»؛ يجب أن يصل الخادم إلى `https://api.nuralquran.net`. |

---

# English

LiveKit runs on the same cPanel/WHM box (CloudLinux 9, LiteSpeed, Imunify360) as a separate systemd service limited to
**4 cores / 4 GB** (`CPUQuota=400%`, `MemoryMax=4G`, cgroup v2). The PHP API mints the access tokens, receives the
LiveKit webhooks and drives the server API; chat/reactions are moderated by the API and broadcast with `SendData`.

## Decision: TLS for the signal connection

LiteSpeed owns 80/443, LiveKit's signal server (7880) expects a TLS-terminating proxy, and proxying long-lived
WebSockets through LiteSpeed (`extprocessor` + `RewriteRule [P]` in userdata includes, as in `deploy/apache-proxy.conf`)
is fragile: idle WebSockets get cut, and every LiteSpeed restart (cPanel updates do that) drops every room.
**Chosen:** a tiny **Caddy** service on **TCP 7443** with the AutoSSL certificate of `rtc.nuralquran.net`, proxying to
`127.0.0.1:7880` (never opened). Clients use `wss://rtc.nuralquran.net:7443`. Media: UDP 50000–60000 + TCP 7881;
embedded TURN: TLS 5349 + UDP 3478. The API talks to LiveKit locally (`http://127.0.0.1:7880`).
Trade-off: 7443 is not 443, so a network that allows only 443 may block signalling (media has TCP/TURN-TLS fallbacks).
Upgrade path: a second IPv4, LiteSpeed bound to the first IP only, `rtc` → second IP, Caddy on `:443`.
The UDP range is 10 001 ports (not 1 001) because each participant uses two peer connections.

## Steps

1. **DNS:** A record `rtc` → the server's IPv4 (WHM *Edit DNS Zone* or cPanel *Zone Editor*).
2. **Subdomain + certificate:** cPanel *Domains* → create `rtc.nuralquran.net` (empty docroot) → *SSL/TLS Status* →
   *Run AutoSSL* until it is green. Keep the subdomain: it is what lets AutoSSL renew the certificate.
3. **Upload** this folder (e.g. `/root/livekit-deploy`).
4. **Install** as root (WHM → *Terminal*): `bash install.sh`. It downloads the pinned LiveKit **v1.8.4** and Caddy
   **v2.10.0** release archives over https, verifies each against the release's published checksums (and against
   `LIVEKIT_SHA256` if you pin it — the script prints the hash to record), creates the `livekit` system user,
   **generates the API key/secret** into `/etc/livekit/keys.yaml` (0600 — never in git), copies the AutoSSL certificate,
   opens the firewall (CSF or firewalld), and starts `livekit`, `caddy-rtc` and `livekit-cert-sync.timer`. It prints
   the four Integration values once.
5. **Admin → Integrations:** `livekit_url = wss://rtc.nuralquran.net:7443`, `livekit_api_url = http://127.0.0.1:7880`,
   `livekit_api_key`, `livekit_api_secret` → Save → *Test* (LiveKit). Also enter FCM (service-account JSON) and APNs
   (`.p8`, key id, team id, bundle id, environment) there.
6. **Cron** (cPanel → *Cron Jobs*, every minute):
   `/opt/cpanel/ea-php82/root/usr/bin/php /home/nuralqur/nuralquran-api/tools/push-worker.php --loop=55 --quiet >/dev/null 2>&1`
   — sends pushes, auto-closes rooms with nobody on stage for 10 min, sends the 10-minute reminders.
7. **Smoke test:** `bash smoke-test.sh` — service state + resource limits, `http://127.0.0.1:7880/` → `OK`,
   `https://rtc.nuralquran.net:7443/` → `OK` with a valid certificate, TURN/TLS certificate on 5349, a Twirp `ListRooms`
   call signed with the real key, and the API webhook answering 401 to an unsigned request. `LOADTEST=1` adds a 30 s
   `lk load-test` (1 audio publisher, 20 subscribers; install `lk` as shown above, checksum-verified).

**Firewall:** TCP 7443, 7881, 5349; UDP 3478, 50000–60000; 7880 stays closed. CSF: add to `TCP_IN`/`TCP6_IN` and
`UDP_IN`/`UDP6_IN` (`50000:60000`), `csf -r`; firewalld: see the command above. Imunify360 with
`port_blocking_mode: ALLOW` leaves port filtering to that firewall (`firewall.sh` checks its blocked-port list).

**Certificate renewal:** AutoSSL renews it; `livekit-cert-sync.timer` (daily 04:20) copies
`/var/cpanel/ssl/apache_tls/rtc.nuralquran.net/combined` (fallback: `whmapi1 fetch_ssl_certificates_for_fqdns`) into
`/etc/livekit/tls/` when it changed, checks key/host/expiry, and restarts Caddy + LiveKit (a few seconds, off-peak).

**Upgrades / key rotation:** `LIVEKIT_VERSION=… bash install.sh` (keys and certificate are kept); to rotate keys delete
`/etc/livekit/keys.yaml`, re-run `install.sh`, paste the new values into Integrations.

**Files:** `livekit.yaml` (template: `__NODE_IP__`, `__API_KEY__` filled in by `install.sh`), `livekit.service`,
`Caddyfile`, `caddy-rtc.service`, `livekit-cert-sync.sh` + `.service` + `.timer`, `sysctl-livekit.conf` (UDP buffers),
`firewall.sh`, `install.sh`, `smoke-test.sh`.
