# Noor Al-Quran API (v1)

PHP 8.2 + MySQL/MariaDB on host.webek.org, served at **`https://api.nuralquran.net/v1`**.
This file is the contract between `api/` (server) and `src/` (web + app). Change both together.

## Conventions

- JSON in, JSON out. UTF-8. Dates `YYYY-MM-DD`, timestamps ISO 8601 UTC.
- Success: `200/201 {"ok":true,"data":…}`. Error: `4xx/5xx {"ok":false,"error":{"code":"…","message":"<Arabic, shown to users>"}}`.
- Common error codes: `unauthenticated` 401, `forbidden` 403, `not_found` 404, `validation` 422 (+ `"fields":{name:msg}`), `rate_limited` 429 (+ `Retry-After`), `maintenance` 503, `banned` 403, `server` 500.
- **Auth:** a session token. The web gets it as an httpOnly cookie `nq_session` (`Domain=.nuralquran.net; Secure; SameSite=Lax; Path=/`); the native app gets it in the JSON body and sends `Authorization: Bearer <token>`. The server accepts either. Sessions last 60 days, refreshed on use; stored hashed (SHA-256).
- **CSRF:** every non-GET request must carry header `X-NQ-Client: web` or `X-NQ-Client: app`. Requests without it get 403. The header forces a CORS preflight, so other sites can't send it. (Only `POST /livekit/webhook` is exempt: it is server-to-server and signed.)
- **Conditional GET:** `/me/conversations` and `/me/notifications` send a weak `ETag`; send it back as `If-None-Match` to get `304` with no body (allowed/exposed in CORS).
- **CORS:** allowed origins come from config (`https://nuralquran.net`, `https://www.nuralquran.net`, `https://nur-alquran.netlify.app`, `capacitor://localhost`, `https://localhost`, `http://localhost:3000`, `http://localhost:5173`). `Access-Control-Allow-Credentials: true`. Never `*`.
- **Rate limits** (per IP and per user, stored in DB): login 10/10 min, signup 5/hour, forgot-password 5/hour, AI 20/hour/user, profile photo upload 10/hour/user, reading log 2/second, writes 120/min, uncached riwaya texts 60/10 min (community limits: see «Rooms & community»).
- **Body size:** request bodies over 64 KB get 413 `payload_too_large` (checked from `Content-Length` before routing). The only exceptions are `POST /me/avatar` and `POST /community/groups/{id}/photo` (multipart, photo ≤ 5 MB).
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
| GET | `/settings/public` | | `{app_name, description, announcement, maintenance_mode, allow_signup, features:{hifz,khatma,khatma_group,leaderboard,ijaza,ai_assistant,notes,search,rooms: bool}, google_login: bool}` |
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
| POST | `/admin/integrations/test` | `{target:"ai"\|"mail"\|"google"\|"livekit"\|"fcm"\|"apns"}` | `{ok, message}` |
| GET | `/admin/tickets` | `?status=&page` | paginated `Ticket[]` with `user` |
| GET | `/admin/tickets/{id}/messages` | `?after_id=` | `Message[]` (marks user messages read) |
| POST | `/admin/tickets/{id}/messages` | `{body}` | `Message` |
| PATCH | `/admin/tickets/{id}` | `{status}` | `Ticket` |
| GET | `/admin/unread` | | `{count}` |
| GET | `/admin/log` | `?page` | paginated `[{id, admin_email, action, target, created_at}]` |

Integration keys: `google_client_id`, `google_client_secret`*, `ai_provider` (`openai`\|`anthropic`), `ai_model`, `openai_api_key`*, `anthropic_api_key`*, `mail_from_address`, `mail_from_name`, `mail_transport` (`server`\|`smtp`, default `server` = PHP `mail()`), `smtp_host`, `smtp_port` (1–65535), `smtp_username`, `smtp_password`*, `smtp_encryption` (`tls` = STARTTLS\|`ssl` = implicit TLS\|`none`). Voice rooms & push: `livekit_url` (`wss://rtc.nuralquran.net:7443`, what clients connect to), `livekit_api_url` (optional, `http://127.0.0.1:7880` when LiveKit runs on the same server; default = `livekit_url` with ws→http), `livekit_api_key`, `livekit_api_secret`* (≥ 32 chars), `fcm_service_account`* (the Firebase service-account JSON, pasted whole, multi-line allowed, ≤ 12 000 chars), `apns_key_p8`* (the `.p8` PEM), `apns_key_id` / `apns_team_id` (10 chars), `apns_bundle_id`, `apns_environment` (`production`\|`sandbox`). (* = secret, encrypted at rest with AES-256-GCM using `app_key` from config.)

## Rooms & community

Live audio rooms («الغرف الصوتية»), community profiles, friends/follows/blocks, direct messages, community groups,
reports, the dictionary filter and push notifications. Feature flag `rooms` (403 `feature_disabled` when off).
Audio goes through a self-hosted **LiveKit** server (`deploy/livekit/`); nothing is recorded. Everything else
(chat, reactions, hands, roles, the shared mushaf page) goes through this API, which moderates/rate-limits it and then
broadcasts it into the room with LiveKit `SendData` — clients never get `canPublishData`.

### Rules (enforced server-side everywhere)

- **Entry:** gender + birthdate required (409 `community_profile_required`, `missing:["gender","birthdate"]` →
  `PATCH /me/community-profile`). Both are **locked** once set together (the account "joins": 409 `gender_locked` /
  `birthdate_locked`, also through `PATCH /auth/profile`); corrections only by an admin (`PATCH /admin/community/users/{id}`).
  Under 13 → 403 `underage`.
- **Minors (13–17):** rooms incl. mixed, may speak; follow and be followed; **no DMs and no friendship either way**
  (403 `minor_restricted`); profile always private; `dm_policy` reported as `"none"`.
- **Gender separation:** room/group `gender_scope` `men` | `women` | `mixed`. A viewer only ever gets rooms/groups of
  their own scope or mixed — lists, search, `GET /rooms/{id}` (404, never 403), joining, notifications, «in a room now»
  on profiles, friends' activity, group lists. A mixed room of a men's group shows `group: null` to women.
  Members-only rooms (`visibility: "group_members"`) exist only for that group's members. Blocks hide profiles, DMs and
  the blocked person's rooms both ways.
- **Suspensions:** 403 `community_suspended` (community-wide: rooms, groups, friends, DMs) or 403 `rooms_banned`
  (rooms only), both with `{until, permanent}`. App-wide bans are the existing `bans` (sessions revoked).
- **Text:** room chat (≤ 500), DMs (≤ 2000), room titles, group names/descriptions and bios are plain text: links,
  e-mail addresses and handles → 422 `links_not_allowed` (`validation` for profile fields). Then the **dictionary**:
  - `severe` («شديدة»): not delivered, kept as evidence, **account suspended in the community until an admin decides**
    (`suspension` notification), removed from the room → 403 `community_suspended`;
  - `possible` («محتملة»): not delivered, sent to the admins → 422 `content_review`.
  Matching folds diacritics/tatweel/invisible characters and letter variants, collapses repeated letters, ignores
  punctuation and spaces between letters («ز ب ا ل ة», «ز.ب.ا.ل.ة»), and reads Arabizi/Franco (2→ء 3→ع 5→خ 6→ط 7→ح 8→ق
  9→ص, sh/kh/gh/th/dh…) by consonant skeleton («7mar» ~ «حمار»), latin words with leetspeak folding. A severe word found
  only after removing every space (could straddle two innocent words) is treated as `possible`. Words that occur in the
  Quran are always stored as `possible` (`forced_possible: true` on create).

### Shapes

```
Brief        { id, name, avatar_url|null }
RoomCard     { id, title, gender_scope, visibility: "public_by_type"|"group_members", status: "open"|"scheduled",
               scheduled_at|null, opened_at|null, locked, owner: Brief|null, group: {id,name,photo_url}|null,
               listener_count, speaker_count, stage: [Brief & {role}] (≤ 6 in lists, all in detail),
               shared: {surah, ayah, page|null, updated_at}|null, reminded: bool,
               my_role: "owner"|"moderator"|"speaker"|"listener"|null, hand_raised: bool,
               // detail only: in_room: bool, hands: [Brief & {raised_at}] (owner/moderators only)
             }
Group        { id, name, description, privacy: "public"|"private", gender_scope, photo_url|null, member_count,
               my_role: "founder"|"moderator"|"member"|null, my_perms: Perm[], created_at,
               // detail: founder: Brief|null, is_following, request_pending, invited, allowed_room_scopes, pending_requests?, rooms: RoomCard[]
             }
Perm         "open_rooms"|"schedule_rooms"|"accept_members"|"kick"|"edit_info"|"assign_moderators"  (founder: all; transfer/delete: founder only)
Conversation { id, other: Brief, started_by_me, last_message: {id, body (≤ 200), from_me, created_at}|null, unread, updated_at }
DM           { id, body, from_me, sender_id, created_at }
ChatLine     { id, kind: "chat"|"system", event: null|"join"|"leave", body, user: Brief & {role?}|null, created_at }
Notification { id, type, title, body, data: {room_id?|group_id?|user_id?|conversation_id?…}, read, created_at }
```
Notification types: `room_opened`, `room_scheduled` (followed person/friend), `group_room` (group you're in/follow),
`reminder_soon` (10 min before), `reminder_started`, `reminder_changed`, `reminder_cancelled` («ذكّرني»), `speak_invite`,
`friend_request`, `friend_accept`, `dm` (push only, not in the list), `join_request` (request or invite), `suspension`
(cannot be muted).

### Community profile, people, social graph (signed in)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/me/community-profile` | | `{joined, eligible, missing[], gender, birthdate, age, is_minor, underage, locked:{gender,birthdate}, user: Brief, profile: {bio, facebook_url, instagram_url, is_private, private_forced, dm_policy: "everyone"\|"same_gender"\|"friends"\|"none", counters:{friends, followers, following, claps_sent, claps_received}}\|null, suspension: {scope, source, reason, until, permanent}\|null, muted_types[]}` |
| PATCH | `/me/community-profile` | `{gender?, birthdate?, bio? (≤ 300), facebook_url?, instagram_url?, is_private?, dm_policy?}` | same. gender/birthdate only until joined; social links: https `facebook.com`/`fb.com` or `instagram.com` profile URLs only (`null` clears). Photo = the existing `POST /me/avatar` |
| GET | `/people?q=` | ≥ 2 chars | `{items:[Brief & {is_friend, i_follow}]}` (community members, minus blocked; 60/min) |
| GET | `/people/{id}` | | `Brief & {is_private, is_me, relation:{is_friend, i_follow, follows_me, request_sent, request_received}, can_friend, can_message, lists_visible}` + when public or friend: `{bio, facebook_url, instagram_url, counters, in_room: {id,title,gender_scope}\|null, joined_at}`. 404 when blocked either way or not a member |
| GET | `/people/{id}/{kind}` | kind = `friends`\|`followers`\|`following`\|`clappers`, `?page` | paginated `Brief[]` (`clappers`: + `claps`) — **friends of that person only** (403) |
| GET | `/me/social/{kind}` | same kinds | my own lists |
| POST / DELETE | `/people/{id}/friend-request` | | send (201 `{status:"requested"}`; if they already asked you → `{status:"friends"}`) / cancel. Sending also follows them: an unanswered request leaves you a follower |
| GET | `/me/friend-requests` | | `{incoming:[Brief&{created_at}], outgoing:[…]}` |
| POST | `/me/friend-requests/{id}/accept` · `/decline` | `{id}` = requester | `{status:"friends"}` / `{}` (declined requester stays a follower) |
| DELETE | `/people/{id}/friend` | | unfriend |
| POST / DELETE | `/people/{id}/follow` | | follow (room notifications only, no contact) / unfollow |
| DELETE | `/me/followers/{id}` | | remove a follower |
| POST / DELETE | `/people/{id}/block` | | block (removes friendship, follows and requests both ways) / unblock |
| GET | `/me/blocks` | | `{items: Brief[]}` |
| GET | `/me/friends/activity` | | `{items:[Brief & {room: {id,title,gender_scope}, role}]}` — friends in rooms you can see |

### Direct messages (signed in; text only, stored)

Who may write: blocked → never (404); minor on either side → never (403 `minor_restricted`); friends → always; the
other person started the conversation → you may reply; else the recipient's `dm_policy` (`everyone` | `same_gender` |
`friends`) → 403 `dm_not_allowed`. 30 messages/min.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/me/conversations` | `?since=ISO` (incremental), header `If-None-Match` | `{items: Conversation[], server_time, ids?}` + `ETag`; **304** with no body when nothing changed (new message, deletion, read). With `since`, only conversations updated after it plus `ids` = every conversation that still exists |
| POST | `/me/conversations` | `{user_id, body}` | 201 `{conversation_id, message: DM}` (creates or continues the pair's conversation) |
| GET | `/me/conversations/{id}/messages` | `?after_id=` (poll) or `?before_id=` (history), `limit ≤ 100` | `{conversation:{id, other, started_by_me, other_read_id}, items: DM[] (oldest first), can_send}` |
| POST | `/me/conversations/{id}/messages` | `{body}` | 201 `{conversation_id, message}` |
| POST | `/me/conversations/{id}/read` | `{last_id?}` | `{}` |
| DELETE | `/me/conversations/{id}/messages/{mid}` | | `{}` — either side; deleted for both and from the database |
| DELETE | `/me/conversations/{id}` | | `{}` — either side; the whole conversation, for both |

Reported messages survive deletion (hidden, kept for the admins until an admin deletes them or dismisses the report).

### Rooms (signed in)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/rooms` | `?tab=live\|scheduled\|groups\|mine&q=&page&per_page` (`groups` = «من جروباتي», members-only rooms included) | paginated `RoomCard[]` |
| POST | `/rooms` | `{title (3–120), gender_scope, visibility?, group_id?, scheduled_at? (ISO, 1 min – 30 days ahead)}` | 201 `RoomCard`. Scope: your own or `mixed`; a group room: the group's scope or `mixed`, needs `open_rooms` (now) / `schedule_rooms` (scheduled). 409 `room_limit` (per person, open + scheduled), 503 `rooms_busy` (site-wide open rooms), 503 `rooms_unavailable` (LiveKit not configured). Followers/friends/group members/group followers who may see it are notified |
| GET | `/rooms/{id}` | | `RoomCard` (detail) + `limits:{max_listeners}` |
| PATCH | `/rooms/{id}` | owner: `{title?, locked?, scheduled_at?}` | `RoomCard`; reminders get `reminder_changed` |
| POST | `/rooms/{id}/start` | owner, scheduled room | `RoomCard` (`reminder_started` + audience notified) |
| DELETE | `/rooms/{id}` | owner | `{}` — close (live) or cancel (scheduled → `reminder_cancelled`) |
| POST | `/rooms/{id}/join` | | `{url, token, identity, livekit_room, role, expires_at, room: RoomCard, me}` → connect with the LiveKit SDK. 403 `kicked`, 403 `room_locked` (newcomers), 409 `room_full` (listeners), 409 `room_not_open` |
| POST | `/rooms/{id}/leave` | `{quiet?: true}` | `{}` — «مغادرة بهدوء»: no «غادر …» line |
| GET | `/rooms/{id}/participants` | | `{stage: [Brief&{role, hand_raised}], listeners: […], listener_count}` |
| POST / DELETE | `/rooms/{id}/hand` | | raise / lower my hand (owner + moderators get a `hand` event) |
| POST / DELETE | `/rooms/{id}/speakers/{uid}` | owner/moderator (anyone may step down themselves; moderators lowered by the owner only) | `{role}`; raising sends `speak_invite` |
| POST / DELETE | `/rooms/{id}/moderators/{uid}` | owner | `{role}` (removed moderator stays a speaker) |
| POST | `/rooms/{id}/participants/{uid}/mute` | owner/moderator (moderators: not the owner/other moderators) | `{muted_tracks}` (server-side mute; only the user can unmute) |
| POST | `/rooms/{id}/participants/{uid}/kick` | same | `{}` — disconnected, cannot rejoin this room |
| PUT | `/rooms/{id}/page` | owner/moderator `{surah, ayah, page? (1–604)}` | `{surah, ayah, page, updated_at}` (broadcast) |
| GET | `/rooms/{id}/chat` | `?after_id=` | `{items: ChatLine[]}` (last 100) |
| POST | `/rooms/{id}/chat` | `{body}` (present participants; 10 per 20 s) | 201 `ChatLine` |
| POST | `/rooms/{id}/reactions` | `{type: clap\|heart\|mashallah\|barakallah\|ameen\|jazakallah, to_user_id?}` | `{type, from, to}` — 1 per 2 s per person (429); `to_user_id` = a directed **clap** («فلان سقّف لفلان») to someone on stage, max once a minute per sender→speaker (429). Counts `claps_sent` / `claps_received` |
| POST / DELETE | `/rooms/{id}/reminder` | scheduled rooms | «ذكّرني» on/off |
| POST | `/livekit/webhook` | LiveKit → API (`Authorization`: HS256 JWT signed with the API secret, `sha256` claim = base64 SHA-256 of the body; no `X-NQ-Client`) | `{handled}`; 401 `invalid_signature`. Handles `participant_joined` / `participant_left` / `room_finished` (presence, counts, kicked users removed again) |

**LiveKit token** (`join.token`, JWT HS256, 6 h): `iss` = API key, `sub` = user id (= LiveKit identity), `name`,
`metadata` = `{"role", "avatar", "user_id"}`, `video` = `{room: "nq-room-<id>", roomJoin, canSubscribe: true,
canPublish: <owner|moderator|speaker>, canPublishSources: ["microphone"] (stage only), canPublishData: false,
canUpdateOwnMetadata: false}`. Role changes are applied live (`UpdateParticipant`) — keep the connection, read the new
permissions/metadata from the SDK's `ParticipantPermissionsChanged` / metadata events.

**Room data events** (LiveKit data packets from the server; JSON, `topic`): `chat` → `{type:"chat"|"system", id, body,
user?, event?, created_at}`; `reaction` → `{type, from, to|null}`; `page` → `{type:"page", surah, ayah, page, by}`;
`room` → `{type: "role" (user, role) | "hand" (user, raised; to owner/mods) | "muted" (user_id) | "kicked" (user_id) |
"updated" (title, locked) | "closed" (reason)}`. Every event carries `room_id`.

**Lifecycle:** a room closes when its owner (or an admin) closes it, or automatically after **10 min with nobody on
stage** (presence from `/join`, `/leave` and the webhook). Closing deletes its chat from the database **except reported
messages**, plus presence, hands and reminders, and deletes the LiveKit room. Scheduled rooms get `reminder_soon` 10 min
before; a scheduled room not started 60 min after its time is cancelled. Admin limits (defaults): 500 listeners per
room, 20 open rooms site-wide, 3 open+scheduled rooms per person, auto-close 10 min.

### Community groups (signed in)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/community/groups` | `?q=&page` | «اكتشف الجروبات»: paginated public `Group[]` of your scope + mixed |
| GET | `/community/groups/mine` | | `{items: Group[], invites: Group[]}` |
| POST | `/community/groups` | `{name (3–80), description?, privacy?, gender_scope}` | 201 `Group` (you are the founder) |
| GET / PATCH / DELETE | `/community/groups/{id}` | PATCH (`edit_info`): `{name?, description?, privacy?}` (scope can't change); DELETE: founder | `Group` (detail) / `{}` |
| POST | `/community/groups/{id}/join` | | `{status:"member"\|"requested"}` — public: joins; private: accepts an invite, else a request (`join_request` to holders of `accept_members`) |
| DELETE | `/community/groups/{id}/membership` | | leave (founder: 409 `transfer_first` unless alone → group deleted) |
| GET | `/community/groups/{id}/members` | `?page` | paginated `Brief & {role, perms, joined_at}` (private groups: members only) |
| DELETE | `/community/groups/{id}/members/{uid}` | `kick` (moderators can't kick moderators) | `{}` |
| GET | `/community/groups/{id}/requests` | `accept_members` | `{items: Brief&{created_at}}` |
| POST | `/community/groups/{id}/requests/{uid}/accept` · `/decline` | `accept_members` | `{status}` / `{}` |
| POST | `/community/groups/{id}/invites` | `{user_id}` (`accept_members`) | 201 `{status:"invited"}`; 422 `not_eligible` (other gender) |
| PUT / DELETE | `/community/groups/{id}/moderators/{uid}` | PUT `{perms: Perm[]}` (`assign_moderators`; non-founders can't grant perms they lack or `assign_moderators`) | `{role, perms}` |
| POST | `/community/groups/{id}/transfer` | `{user_id}` founder only | `Group` (old founder → moderator with all perms) |
| POST / DELETE | `/community/groups/{id}/follow` | public groups | room notifications without joining |
| POST / DELETE | `/community/groups/{id}/photo` | multipart `photo` (as `/me/avatar`), `edit_info` | `Group` |

### Reports, devices, notifications (signed in)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/reports/reasons` | | `{items:[{id, label}]}` — `harassment, hate, sexual, spam, impersonation, inappropriate_photo, child_safety, violence, gender_rules, other` |
| POST | `/reports` | `{target_type: user\|photo\|room_message\|dm_message\|room\|group\|group_photo, target_id, reason, details?}` | 201 `{id, status}` (same open report twice → 200 same id). Snapshot kept; reported messages are retained |
| POST | `/me/devices` | `{provider: "fcm"\|"apns", token, platform?: android\|ios\|web, app_version?}` (APNs: hex device token) | 201 — upsert by token (moves to the signed-in user); 10 devices per account. Call after login and on token refresh |
| DELETE | `/me/devices` | `{token}` | `{}` — call on logout |
| GET | `/me/notifications` | `?after_id=&limit≤100`, `If-None-Match` | `{items: Notification[] (newest first), unread, max_id}` + `ETag` / 304 |
| POST | `/me/notifications/read` | `{ids:[…]}` or `{all:true}` | `{}` |
| GET / PUT | `/me/notification-prefs` | PUT `{muted: Type[]}` | `{types:[{type, muted}]}` — muted types are still listed in-app but never pushed |

**Push:** FCM HTTP v1 (service account → RS256 assertion → OAuth token, cached) and APNs (token auth, ES256 JWT with
the `.p8`, 50-min reuse, HTTP/2, `apns-topic` = bundle id, `apns-collapse-id` per conversation/room). Each notification is
queued per device (`push_queue`) and sent in small batches after the response and every minute by
`php ~/nuralquran-api/tools/push-worker.php --loop=55` (cron). Payload: FCM `notification{title,body}` +
`data{type, room_id?, group_id?, user_id?, conversation_id?, …}` (strings), Android channel `community`; APNs
`aps.alert{title,body}` + top-level `type`, `data`. Dead tokens (FCM `UNREGISTERED`, APNs 410) delete the device;
429/5xx retry 5× with back-off. Config overrides for tests only: `push_fcm_endpoint`, `push_fcm_token_url`, `push_apns_endpoint`.

### Admin (is_admin) — every action is written to `admin_log`

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/admin/community/reports` | `?status=open\|dismissed\|actioned\|all&source=user\|dictionary&type=…&page` | paginated `{id, source, level, target_type, target_id, target_user, reporter, reason, reason_label, details, snapshot, current (the content now, or null), status, decision, …}` (severe first) |
| GET | `/admin/community/reports/{id}` | | same + `user_history` |
| POST | `/admin/community/reports/{id}/decision` | `{action: dismiss\|delete_content\|remove_photo\|suspend\|ban_rooms\|ban_app\|release, duration_days? (null = permanent), note?, also_delete?}` | report. `release` delivers a held «possible» DM. Dismissing the last open report of a message releases its retention |
| GET | `/admin/community/suspensions` | `?source=dictionary\|admin` | paginated `{user, scope, source, reason, until, locked, report_id, evidence:[held text…]}` |
| POST | `/admin/community/suspensions/{id}/reactivate` · `/lock` | user id | `{}` — lift / make permanent |
| POST | `/admin/community/users/{id}/suspend` | `{scope: community\|rooms\|app, duration_days?, reason?}` | `{}` (also removes them from live rooms) |
| PATCH | `/admin/community/users/{id}` | `{gender?, birthdate?}` | `User` — correction (support requests); leaves rooms/groups of the other type |
| DELETE | `/admin/community/users/{id}/photo` · `/admin/community/groups/{id}/photo` · `/admin/community/groups/{id}` | | `{}` |
| GET | `/admin/community/rooms` | `?status=open\|scheduled` | `{items:[…all genders…], limits, open_count}` |
| DELETE | `/admin/community/rooms/{id}` | | `{}` — close now |
| GET / POST | `/admin/community/dictionary` | GET `?q=&level=`; POST `{word, level: severe\|possible, note?, in_quran?}` | paginated words / 201 word + `forced_possible` (409 when an equivalent form exists) |
| PATCH / DELETE | `/admin/community/dictionary/{id}` | `{level?, note?}` | word / `{}` |
| POST | `/admin/community/dictionary/test` | `{text}` | `{match: {id, word, level}\|null, has_link, forms}` (nothing stored) |
| GET / PUT | `/admin/community/settings` | PUT `{rooms:{max_listeners (1–5000), max_concurrent (1–500), max_per_user (1–20), auto_close_minutes (2–240)}}` | `{rooms, bounds, livekit_configured, fcm_configured, apns_configured}` |

Rate limits (community): room chat 10/20 s, DMs 30/min, reports 20/h, friend requests + follows 60/h, room creation 10/h,
group creation 5/h, people search 60/min; reactions 1/2 s and directed claps 1/min per pair (exact, not windowed).

## Install

`https://api.nuralquran.net/install.php` — works only while no config file exists. It asks for the MySQL database, user and password (created by the owner in cPanel) and the first admin's name, email and password; tests the connection; writes `config.php` **outside** the web root with a random `app_key`; creates the schema; creates the admin; then refuses to run again.
