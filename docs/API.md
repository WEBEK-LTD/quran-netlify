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
- **Rate limits** (per IP and per user, stored in DB): login 10/10 min, signup 5/hour, forgot-password 5/hour, AI 20/hour/user, reading log 2/second, writes 120/min.
- **Maintenance mode:** when `maintenance_mode` is on, every route except `GET /settings/public`, `/auth/*` and `/admin/*` returns 503 `maintenance` for non-admins.
- **Bans:** a banned user (scope `app`) can't sign in; their sessions are revoked.
- **Pagination:** `?page=1&per_page=50` (max 100) → `data: {items:[…], page, per_page, total}`.

## Shapes

```
User      { id, email, name, avatar_url|null, gender: "male"|"female"|null, birthdate|null,
            is_admin: bool, email_verified: bool, show_on_leaderboard: bool, created_at }
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
```

## Public

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/health` | | `{status:"ok", db:true}` |
| GET | `/settings/public` | | `{app_name, description, announcement, maintenance_mode, allow_signup, features:{hifz,khatma,khatma_group,leaderboard,ijaza,ai_assistant,notes,search: bool}, google_login: bool}` |
| GET | `/broadcasts` | | `Broadcast[]` (active, not expired) |
| GET | `/leaderboard` | `type=reading\|hifz\|khatma`, `period=week\|month\|all` | `[{rank, name, score, is_me}]` top 50, only users with `show_on_leaderboard` |
| POST | `/presence` | `{visitor_id, path}` | `{}` — call every 60 s |

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/signup` | `{name, email, password}` (password ≥ 8) | 201 `{user, token}` and cookie. Sends a verification email. Refused 403 `signup_closed` if `allow_signup` is off; `email_taken` 422 |
| POST | `/auth/login` | `{email, password}` | `{user, token}` + cookie. `invalid_credentials` 401 |
| POST | `/auth/logout` | | `{}` — revokes the session, clears cookie |
| GET | `/auth/me` | | `{user}` or 401 |
| POST | `/auth/verify-email` | `{token}` | `{user}` |
| POST | `/auth/resend-verification` | | `{}` |
| POST | `/auth/forgot-password` | `{email}` | `{}` always (no account enumeration) |
| POST | `/auth/reset-password` | `{token, password}` | `{}` — revokes all sessions |
| POST | `/auth/change-password` | `{current_password, new_password}` | `{}` — revokes other sessions. Google-only accounts may set a password without `current_password` |
| PATCH | `/auth/profile` | `{name?, show_on_leaderboard?}` | `{user}` |
| DELETE | `/auth/account` | `{password}` (or `{confirm:"DELETE"}` for Google-only accounts) | `{}` — deletes the user and every row they own; group rooms they own are deleted |
| GET | `/auth/export` | | all of the user's data as JSON (download) |
| GET | `/auth/google/start` | `?next=/dashboard&client=web\|app` | 302 to Google |
| GET | `/auth/google/callback` | (from Google) | web: sets cookie, 302 to `https://nuralquran.net/auth/callback?status=ok&next=…`; app: 302 to `nuralquran://auth?token=…`; error: `…/auth/callback?status=error&reason=…` |

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

Integration keys: `google_client_id`, `google_client_secret`*, `ai_provider` (`openai`\|`anthropic`), `ai_model`, `openai_api_key`*, `anthropic_api_key`*, `mail_from_address`, `mail_from_name`. (* = secret, encrypted at rest with AES-256-GCM using `app_key` from config.)

## Install

`https://api.nuralquran.net/install.php` — works only while no config file exists. It asks for the MySQL database, user and password (created by the owner in cPanel) and the first admin's name, email and password; tests the connection; writes `config.php` **outside** the web root with a random `app_key`; creates the schema; creates the admin; then refuses to run again.
