# Noor Al-Quran API (v1)

PHP 8.2 + MySQL/MariaDB on host.webek.org, served at **`https://api.nuralquran.net/v1`**.
This file is the contract between `api/` (server) and `src/` (web + app). Change both together.

## Conventions

- JSON in, JSON out. UTF-8. Dates `YYYY-MM-DD`, timestamps ISO 8601 UTC.
- Success: `200/201 {"ok":true,"data":…}`. Error: `4xx/5xx {"ok":false,"error":{"code":"…","message":"<Arabic, shown to users>"}}`.
- Common error codes: `unauthenticated` 401, `forbidden` 403, `not_found` 404, `validation` 422 (+ `"fields":{name:msg}`), `rate_limited` 429 (+ `Retry-After`), `maintenance` 503, `banned` 403, `server` 500.
- **Auth:** a session token. The web gets it as an httpOnly cookie `nq_session` (`Domain=.nuralquran.net; Secure; SameSite=Lax; Path=/`); the native app gets it in the JSON body and sends `Authorization: Bearer <token>`. The server accepts either. Sessions last 60 days, refreshed on use; stored hashed (SHA-256).
- **CSRF:** every non-GET request must carry header `X-NQ-Client: web` or `X-NQ-Client: app`. Requests without it get 403. The header forces a CORS preflight, so other sites can't send it.
- **CORS:** allowed origins come from config (`https://nuralquran.net`, `https://www.nuralquran.net`, `https://nur-alquran.netlify.app`, `capacitor://localhost`, `https://localhost`, `http://localhost:3000`, `http://localhost:5173`). `Access-Control-Allow-Credentials: true`. Never `*`.
- **Rate limits** (per IP and per user, stored in DB): login 10/10 min, signup 5/hour, forgot-password 5/hour, AI 20/hour/user, profile photo upload 10/hour/user, reading log 2/second, writes 120/min, uncached riwaya texts 60/10 min.
- **Body size:** request bodies over 64 KB get 413 `payload_too_large` (checked from `Content-Length` before routing). The only exception is `POST /me/avatar` (multipart, photo ≤ 5 MB).
- **Maintenance mode:** when `maintenance_mode` is on, every route except `GET /settings/public`, `/auth/*`, `/admin/*` and `GET /avatars/*` returns 503 `maintenance` for non-admins.
- **Bans:** a banned user (scope `app`) can't sign in; their sessions are revoked.
- **Pagination:** `?page=1&per_page=50` (max 100) → `data: {items:[…], page, per_page, total}`.

## Shapes

```
User      { id, email, name, lang: "ar"|"en"|"tr"|"fr"|"ur"|"id", avatar_url|null, gender: "male"|"female"|null, birthdate|null,
            is_admin: bool, email_verified: bool, show_on_leaderboard: bool, created_at }
            // avatar_url: the uploaded photo (absolute https://api.nuralquran.net/v1/avatars/… URL) if any,
            // else the Google picture, else null. A new upload always gets a new URL.
Bookmark  { surah, ayah, created_at }
Note      { surah, ayah, text, updated_at }
Progress  { surah, ayah, updated_at }
Khatma    { id, type: "reading"|"memorizing"|"daily"|"listening"|"review", start_date, end_date, notes, created_at }
Room      { code, deceased_name, mode: "juz"|"hizb", is_public, completions, owner_id, is_owner: bool,
            created_at, parts: Part[] }          // parts only on GET /groups/{code}
Part      { part_index, label, assignee, done, done_by_name|null, done_at|null,
            takers: [{ id, name, user_id, done, is_me: bool }] }
Ticket    { id, subject, topic, status: "open"|"pending"|"closed", created_at, updated_at, unread: int, message_count: int, user?: {id,email,name} }
Message   { id, ticket_id, body, is_admin: bool, sender_name, created_at }
Broadcast { id, title, body, type: "info"|"warning"|"success", created_at, expires_at|null }
Station   { id, name_ar, name_en, country: "EG"|…|null, category: "quran"|"recitation"|"tafsir"|"programs", featured: bool,
            source: "catalog"|"mp3quran", url: string|null, hls: bool, status: "ok"|"down"|"unknown", bitrate: int|null }
            // url is always https (never http: mixed content); null = no usable URL. bitrate in kbps (icy-br / HLS BANDWIDTH).
Recitation { reciter, reciter_id, moshaf, moshaf_id, style: "murattal"|"mujawwad"|"muallim"|null, combined: bool,
            server, surahs: int[] }   // file of surah N = server + zero-padded N + ".mp3" (e.g. …/001.mp3)
```

## Public

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/health` | | `{status:"ok", db:true}` |
| GET | `/settings/public` | | `{app_name, description, announcement, maintenance_mode, allow_signup, features:{hifz,khatma,khatma_group,leaderboard,ijaza,ai_assistant,notes,search: bool}, google_login: bool}` |
| GET | `/broadcasts` | | `Broadcast[]` (active, not expired) |
| GET | `/leaderboard` | `type=reading\|hifz\|khatma`, `period=week\|month\|all` | `[{rank, name, score, is_me}]` top 50, only users with `show_on_leaderboard` |
| POST | `/presence` | `{visitor_id, path}` | `{}` — call every 60 s |
| GET | `/riwayat/text/{edition}/{surah}` | `edition` ∈ `ara-quranuthmanihaf` (Hafs), `ara-quranshouba`, `ara-quranwarsh`, `ara-quranqaloon`, `ara-quranbazzi`, `ara-quranqumbul`, `ara-qurandoori`, `ara-quransoosi`; `surah` 1–114 | `{edition, surah, ayahs: string[]}` (Uthmani/Hafs numbering) |
| GET | `/riwayat/audio` | | `{updated_at, stale: bool, rawis: {<rawi>: Recitation[]}}` |
| GET | `/radio` | | `{checked_at\|null, stale: bool, stations: Station[]}` |

**Riwayat** (page «الإجازة والقراءات», feature `ijaza`; no auth, plain GETs, safe to cache):
- `/riwayat/text/…` — King Fahd Complex texts published by fawazahmed0/quran-api. The server fetches a surah once
  (jsDelivr, then raw.githubusercontent), checks the shape (`{"chapter":[{chapter, verse, text}]}`, one row per ayah),
  strips invisible direction marks (U+200E/U+200F/BOM), re-joins a tanween split from its final alif («هُدࣰ ى» → «هُدࣰى»),
  and keeps it forever in `storage/cache/riwayat/<edition>-<surah>.json`. Letters are never normalised.
  `Cache-Control: public, max-age=604800`. Uncached fetches are rate-limited to 60 per 10 min per IP (429).
  Unknown edition / surah → 404; every upstream down → 502 `upstream`.
- `/riwayat/audio` — mp3quran.net `GET /api/v3/reciters?language=ar`, fetched at most once per 24 h
  (`storage/cache/riwayat/audio-map.json`); when a refresh fails the last copy is served with `stale: true`
  (and the next refresh is tried 10 min later). Nothing cached and mp3quran down → 502 `upstream`. `Cache-Control: public, max-age=3600`.
  Rawi ids: `hafs, shuba, warsh, qalun, bazzi, qunbul, duri_abuamr, susi, hisham, ibndhakwan, khalaf_hamza, khallad,
  abulharith, duri_kisai, ibnwardan, ibnjammaz, ruways, rawh, ishaq, idris` (all present; `[]` = no recording found).
  A moshaf is matched by its riwaya name (Arabic, normalised): «الدوري» needs «أبي عمرو» or «الكسائي», «خلف» needs «حمزة»;
  a combined moshaf («البزي وقنبل عن ابن كثير», «يعقوب الحضرمي بروايتي رويس وروح») is listed under each rawi with
  `combined: true`; tariq-specific ones («قالون عن نافع من طريق أبي نشيط») count for their rawi. Only `https` servers.
  Sorted: single riwaya before combined, «مرتل» before «مجود» before «معلم», then most surahs.
- Upstreams can be overridden in `config.php` (`riwayat_upstream_text`: list of base URLs ending in `/editions`,
  `riwayat_upstream_audio`: list of base URLs ending in `/api/v3`) — for local tests only; plain `http` is accepted only for 127.0.0.1/localhost.
- Check the live sources from the server: `php ~/nuralquran-api/tools/check-riwayat.php` (add `--refresh` to rewrite the audio cache,
  `--surah=N`, `--edition=…`, `--no-head`).

**Radio** (page «الإذاعة»; no auth, plain GET, `Cache-Control: public, max-age=600`):
- Stations = the curated catalogue in `api/app/Core/RadioCatalog.php` (official national Quran radios — Cairo, Saudi,
  Sharjah, Abu Dhabi, Noor Dubai, Kuwait, Jordan, Nablus, Zitouna, Mohammed VI, Qatar, Oman, Algeria, Bahrain, Haramain
  live… — each with an ordered list of candidate stream URLs), then the mp3quran.net 24/7 channels
  (`GET https://www.mp3quran.net/api/v3/radios?language=ar`, English names from `language=eng`; cached 24 h in
  `storage/cache/radio/mp3quran.json`, stale copy kept when a refresh fails, retried after 10 min). mp3quran entries
  whose URL or name duplicates an earlier station are dropped, as are non-https ones. Category for mp3quran: `tafsir`
  when the name says «تفسير», `programs` for رقية/أذكار/فتاوى/سيرة/دروس…, else `recitation`.
- Stream check (at most every 6 h, `storage/cache/radio/status.json`): every candidate is probed in parallel with a short
  GET (≤ 32 KB read, 8 s, ≤ 5 redirects, no Range header). Accepted: `audio/*`, `application/ogg`, ICY responses, raw
  MP3/AAC/Ogg bytes (sniffed), HLS playlists (`application/vnd.apple.mpegurl`, `audio/mpegurl`, … with `#EXT-X-` → `hls:true`;
  refused when it lists `http://` media). Plain `.m3u`/`.pls` playlists are followed one level. A stream must deliver
  ≥ 2 KB. Per station the first working candidate wins; `url` is the first URL of its redirect chain from which every hop is
  https (an http candidate counts only when it redirects to https). No working candidate → `status:"down"` and `url` =
  the first https candidate (or null). Never checked yet (or the station's candidates changed) → `status:"unknown"`.
  A check that reaches nothing at all while the previous one had working stations is discarded (previous results served,
  `stale:true`, retried after 10 min). With old results and PHP-FPM/LiteSpeed the check runs after the response is sent;
  the very first check runs inside the request (≈ 10–30 s) — run the CLI below after deploying.
- Config (local tests only): `radio_catalog` (replaces the catalogue), `radio_upstream_mp3quran` (list of base URLs ending
  in `/api/v3`); plain `http://127.0.0.1` is then treated as browser-safe.
- Check from the server: `php ~/nuralquran-api/tools/check-radio.php` (prints every candidate and the chosen URL;
  `--refresh` rewrites the caches `/v1/radio` serves, `--only=id1,id2`, `--catalog` skips mp3quran). Exit 1 when a
  featured station is down or the mp3quran list is unreachable.

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/signup` | `{name, email, password, lang?}` (password ≥ 8) | 201 `{user, token}` and cookie. Sends a verification email in `lang` (stored on the account, default `ar`; unknown value → 422). Refused 403 `signup_closed` if `allow_signup` is off; `email_taken` 422 |
| POST | `/auth/login` | `{email, password, lang?}` | `{user, token}` + cookie. `invalid_credentials` 401. A valid `lang` different from the stored one updates it (unknown values are ignored) |
| POST | `/auth/logout` | | `{}` — revokes the session, clears cookie |
| GET | `/auth/me` | | `{user}` or 401 |
| POST | `/auth/verify-email` | `{token}` | `{user}` |
| POST | `/auth/resend-verification` | | `{}` |
| POST | `/auth/forgot-password` | `{email, lang?}` | `{}` always (no account enumeration). The reset email is in `lang` if given, else the account's language |
| POST | `/auth/reset-password` | `{token, password}` | `{}` — revokes all sessions |
| POST | `/auth/change-password` | `{current_password, new_password}` | `{}` — revokes other sessions. Google-only accounts may set a password without `current_password` |
| PATCH | `/auth/profile` | `{name?, show_on_leaderboard?, lang?}` | `{user}` — `lang` is the language of the account's emails |
| DELETE | `/auth/account` | `{password}` (or `{confirm:"DELETE"}` for Google-only accounts) | `{}` — deletes the user and every row they own; group rooms they own are deleted; the profile photo file is deleted |
| GET | `/auth/export` | | all of the user's data as JSON (download), incl. `profile_photo_url` (uploaded photo or null) |
| GET | `/auth/google/start` | `?next=/dashboard&client=web\|app&lang=en` | 302 to Google. `lang` is kept in the OAuth state: new accounts get it (and their welcome email in it), existing accounts have it updated |
| GET | `/auth/google/callback` | (from Google) | web: sets cookie, 302 to `https://nuralquran.net/auth/callback?status=ok&next=…`; app: 302 to `nuralquran://auth?token=…`; error: `…/auth/callback?status=error&reason=…` |

Emails (verification, reset, welcome, password changed, team messages, admin test) are sent in the account's `lang`; ar/ur are right-to-left. Text written by an admin is shown as written.

Email links point to the site, which calls the API:
- verify: `https://nuralquran.net/auth/callback?type=verify&token=…` → `POST /auth/verify-email`
- reset: `https://nuralquran.net/reset-password?token=…` → `POST /auth/reset-password`

## Personal data (signed in)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/me/bookmarks` | | `Bookmark[]` |
| PUT | `/me/bookmarks` | `{items:[{surah,ayah}]}` (replace all, max 2000) | `Bookmark[]` |
| POST | `/me/bookmarks` | `{surah, ayah}` | `Bookmark[]` |
| DELETE | `/me/bookmarks/{surah}/{ayah}` | | `Bookmark[]` |
| GET | `/me/notes` | | `Note[]` newest first |
| PUT | `/me/notes/{surah}/{ayah}` | `{text}` (≤ 5000) | `Note` |
| DELETE | `/me/notes/{surah}/{ayah}` | | `{}` |
| GET | `/me/progress` | | `Progress\|null` |
| PUT | `/me/progress` | `{surah, ayah}` | `Progress` |
| POST | `/me/reading` | `{surah, ayah}` | `{today:int}` — logs one distinct ayah read today (user's date sent as `X-NQ-Date: YYYY-MM-DD`, must be within ±1 day of server UTC date) |
| GET | `/me/stats` | `?days=365` | `{days:[{date, ayahs}], total_ayahs, streak, best_streak}` |
| GET | `/me/hifz` | | `{data, updated_at}\|null` |
| PUT | `/me/hifz` | `{data, updated_at}` | `{data, updated_at}`; server derives the memorised surah count for the leaderboard |
| GET | `/me/khatmat` | | `Khatma[]` |
| POST | `/me/khatmat` | `{type, start_date, end_date, notes}` | `Khatma` |
| PATCH | `/me/khatmat/{id}` | same fields | `Khatma` |
| DELETE | `/me/khatmat/{id}` | | `{}` |

## Profile photo

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/me/avatar` | `multipart/form-data`, field `photo` (≤ 5 MB; JPEG, PNG, WebP or GIF — first frame) | `{user}` with the new `avatar_url`. Replaces (and deletes) the previous photo |
| DELETE | `/me/avatar` | | `{user}` — `avatar_url` falls back to the Google picture, else null. Harmless when there is none |
| GET | `/avatars/{file}` | | the image itself (not JSON): `image/webp` (or `image/jpeg` when the server has no WebP encoder) |

- Signed in + `X-NQ-Client` as for every write. Don't set `Content-Type` yourself (the browser adds the boundary).
- The type is detected from the file's bytes (magic number + `getimagesize` + `finfo`), never from the name or the sent MIME type. SVG, HEIC, animated WebP etc. → 422 `unsupported_image`.
- Dimensions 64×64 … 6000×6000, else 422 `image_dimensions`. Over 5 MB → 413 `avatar_too_large`. No `photo` field → 422 `validation` (`fields.photo`). 10 uploads/hour/user → 429.
- The server never keeps or serves the uploaded bytes: it applies EXIF rotation, centre-crops to a square, resizes to 512×512 and re-encodes (WebP q82, else JPEG q82), which strips all metadata. Clients should still crop/resize first (the web sends a 512×512 image) so uploads stay small.
- Server without GD → 503 `avatar_unavailable` («رفع الصور غير متاح على الخادم حالياً.»).
- `GET /avatars/{file}` is public (file names are `<user id>-<24 random hex>.webp`, so they can't be guessed) and sends `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, `Cross-Origin-Resource-Policy: cross-origin`. Unknown or removed files → 404 JSON. It needs no session and no database.
- Files live in `storage/avatars/` next to `app/` (outside the web root).

## Group khatma (signed in)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/groups` | `{deceased_name, mode, is_public, parts:[{part_index,label,assignee}]}` | 201 `Room` with parts. Server generates a 7-char code (unambiguous alphabet, crypto random). Max 20 rooms per owner |
| GET | `/groups/mine` | | `Room[]` owned or joined, each with `done_count`, `total` |
| GET | `/groups/public` | `?page` | paginated `Room[]` with `done_count`, `total` |
| GET | `/groups/{code}` | | `Room` with parts and takers. Private rooms are readable by code (the code is the invitation); the caller is recorded as a member |
| PATCH | `/groups/{code}` | `{is_public?}` owner only | `Room` |
| POST | `/groups/{code}/new-round` | owner only | `Room` (parts reset, completions +1) |
| DELETE | `/groups/{code}` | owner only | `{}` |
| DELETE | `/groups/{code}/membership` | | `{}` (leave a joined room) |
| POST | `/groups/{code}/parts/{i}/claim` | `{name}` | `Room` |
| DELETE | `/groups/{code}/parts/{i}/claim` | | `Room` (release my claim) |
| POST | `/groups/{code}/parts/{i}/done` | `{done: bool}` | `Room` — only a taker of that part, or the owner. The part is done when any taker is done |

The site polls `GET /groups/{code}` every 10 s while a room is open.

## Support (signed in)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/support/tickets` | | `Ticket[]` mine |
| POST | `/support/tickets` | `{subject, topic, body}` | 201 `Ticket` |
| GET | `/support/tickets/{id}/messages` | `?after_id=` | `Message[]` (marks admin messages read) |
| POST | `/support/tickets/{id}/messages` | `{body}` | `Message` (reopens a closed ticket? no: 409 `ticket_closed`) |

The site polls messages every 5 s while a ticket is open.

## AI assistant (signed in, feature `ai_assistant` on)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/ai/chat` | `{messages:[{role:"user"\|"assistant", content}], context?:{surah, ayah, text}}` — ≤ 12 messages, each ≤ 2000 chars | `{reply}`. The server builds the system prompt; provider, model and key come from admin integrations. 503 `ai_not_configured` if no key |

## Admin (is_admin)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/stats` | | `{users_total, users_today, users_7d, signups_by_day:[{date,count}] (14 d), ayahs_total, tickets_open, online_now:{total, signed_in, guests}, active_7d}` |
| GET | `/admin/users` | `?q=&filter=all\|admins\|banned\|active&page` | paginated `User & {banned, last_seen, ayahs_total}` |
| PATCH | `/admin/users/{id}` | `{is_admin?, gender?}` | `User` (can't remove own admin) |
| POST | `/admin/users/{id}/ban` | `{scope:"app", reason, until?}` | `{}` (revokes sessions) |
| DELETE | `/admin/users/{id}/ban` | | `{}` |
| POST | `/admin/users/{id}/message` | `{subject, body}` | `Ticket` (opens a ticket to the user, first message from admin) |
| GET | `/admin/broadcasts` | | `Broadcast[]` all |
| POST | `/admin/broadcasts` | `{title, body, type, expires_at?}` | `Broadcast` |
| DELETE | `/admin/broadcasts/{id}` | | `{}` |
| GET | `/admin/settings` | | `{app_name, description, announcement, maintenance_mode, allow_signup, features:{…}}` |
| PUT | `/admin/settings` | any subset of the above | same |
| GET | `/admin/integrations` | | `{items:[{key, label, set: bool, preview: "sk-…ab12"\|null, secret: bool}]}` — secrets never returned |
| PUT | `/admin/integrations` | `{key: value, …}` (empty string clears) | same as GET |
| POST | `/admin/integrations/test` | `{target:"ai"\|"mail"\|"google"}` | `{ok, message}` |
| GET | `/admin/tickets` | `?status=&page` | paginated `Ticket[]` with `user` |
| GET | `/admin/tickets/{id}/messages` | `?after_id=` | `Message[]` (marks user messages read) |
| POST | `/admin/tickets/{id}/messages` | `{body}` | `Message` |
| PATCH | `/admin/tickets/{id}` | `{status}` | `Ticket` |
| GET | `/admin/unread` | | `{count}` |
| GET | `/admin/log` | `?page` | paginated `[{id, admin_email, action, target, created_at}]` |

Integration keys: `google_client_id`, `google_client_secret`*, `ai_provider` (`openai`\|`anthropic`), `ai_model`, `openai_api_key`*, `anthropic_api_key`*, `mail_from_address`, `mail_from_name`, `mail_transport` (`server`\|`smtp`, default `server` = PHP `mail()`), `smtp_host`, `smtp_port` (1–65535), `smtp_username`, `smtp_password`*, `smtp_encryption` (`tls` = STARTTLS\|`ssl` = implicit TLS\|`none`). (* = secret, encrypted at rest with AES-256-GCM using `app_key` from config.)

## Install

`https://api.nuralquran.net/install.php` — works only while no config file exists. It asks for the MySQL database, user and password (created by the owner in cPanel) and the first admin's name, email and password; tests the connection; writes `config.php` **outside** the web root with a random `app_key`; creates the schema; creates the admin; then refuses to run again.
