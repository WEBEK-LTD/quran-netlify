-- Noor Al-Quran API — database schema (MySQL 8 / MariaDB 10.4+).
-- Idempotent: safe to run again on every update (CREATE TABLE IF NOT EXISTS).
-- All timestamps are stored in UTC.

CREATE TABLE IF NOT EXISTS users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email               VARCHAR(254) NOT NULL,
  name                VARCHAR(100) NOT NULL DEFAULT '',
  lang                VARCHAR(5) NOT NULL DEFAULT 'ar',
  avatar_url          VARCHAR(500) NULL,
  avatar_file         VARCHAR(100) NULL,
  gender              ENUM('male','female') NULL,
  birthdate           DATE NULL,
  is_admin            TINYINT(1) NOT NULL DEFAULT 0,
  email_verified_at   DATETIME NULL,
  show_on_leaderboard TINYINT(1) NOT NULL DEFAULT 0,
  password_hash       VARCHAR(255) NULL,
  google_sub          VARCHAR(64) NULL,
  apple_sub           VARCHAR(191) NULL,
  apple_refresh_token TEXT NULL,
  hifz_completed      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL,
  updated_at          DATETIME NULL,
  last_seen_at        DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google_sub (google_sub),
  UNIQUE KEY uq_users_apple_sub (apple_sub),
  KEY ix_users_created (created_at),
  KEY ix_users_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash   CHAR(64) NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL,
  expires_at   DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL,
  ip           VARCHAR(45) NOT NULL DEFAULT '',
  user_agent   VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  purpose    ENUM('verify','reset') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_tokens_hash (token_hash),
  KEY ix_email_tokens_user (user_id, purpose),
  CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash CHAR(64) NOT NULL,
  next_path  VARCHAR(255) NOT NULL DEFAULT '/',
  client     ENUM('web','app') NOT NULL DEFAULT 'web',
  lang       VARCHAR(5) NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (state_hash),
  KEY ix_oauth_states_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id    INT UNSIGNED NOT NULL,
  surah      TINYINT UNSIGNED NOT NULL,
  ayah       SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, surah, ayah),
  CONSTRAINT fk_bookmarks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notes (
  user_id    INT UNSIGNED NOT NULL,
  surah      TINYINT UNSIGNED NOT NULL,
  ayah       SMALLINT UNSIGNED NOT NULL,
  text       TEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, surah, ayah),
  KEY ix_notes_updated (user_id, updated_at),
  CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id    INT UNSIGNED NOT NULL,
  surah      TINYINT UNSIGNED NOT NULL,
  ayah       SMALLINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per distinct ayah read per user per day.
CREATE TABLE IF NOT EXISTS reading_log (
  user_id    INT UNSIGNED NOT NULL,
  read_date  DATE NOT NULL,
  surah      TINYINT UNSIGNED NOT NULL,
  ayah       SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, read_date, surah, ayah),
  KEY ix_reading_log_date (read_date),
  CONSTRAINT fk_reading_log_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hifz (
  user_id           INT UNSIGNED NOT NULL,
  data              MEDIUMTEXT NOT NULL,
  client_updated_at DATETIME(3) NOT NULL,
  updated_at        DATETIME NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_hifz_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS khatmat (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM('reading','memorizing','daily','listening','review') NOT NULL DEFAULT 'reading',
  start_date DATE NOT NULL,
  end_date   DATE NULL,
  notes      VARCHAR(2000) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_khatmat_user (user_id, created_at),
  CONSTRAINT fk_khatmat_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_rooms (
  code          CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_id      INT UNSIGNED NOT NULL,
  deceased_name VARCHAR(100) NOT NULL DEFAULT '',
  mode          ENUM('juz','hizb') NOT NULL DEFAULT 'juz',
  is_public     TINYINT(1) NOT NULL DEFAULT 0,
  completions   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL,
  updated_at    DATETIME NOT NULL,
  PRIMARY KEY (code),
  KEY ix_group_rooms_owner (owner_id),
  KEY ix_group_rooms_public (is_public, created_at),
  CONSTRAINT fk_group_rooms_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_parts (
  room_code    CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  part_index   SMALLINT UNSIGNED NOT NULL,
  label        VARCHAR(100) NOT NULL DEFAULT '',
  assignee     VARCHAR(100) NOT NULL DEFAULT '',
  done         TINYINT(1) NOT NULL DEFAULT 0,
  done_by_name VARCHAR(100) NULL,
  done_at      DATETIME NULL,
  PRIMARY KEY (room_code, part_index),
  CONSTRAINT fk_group_parts_room FOREIGN KEY (room_code) REFERENCES group_rooms (code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_takers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_code  CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  part_index SMALLINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  name       VARCHAR(100) NOT NULL,
  done       TINYINT(1) NOT NULL DEFAULT 0,
  done_at    DATETIME NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_takers (room_code, part_index, user_id),
  KEY ix_group_takers_user (user_id),
  CONSTRAINT fk_group_takers_part FOREIGN KEY (room_code, part_index) REFERENCES group_parts (room_code, part_index) ON DELETE CASCADE,
  CONSTRAINT fk_group_takers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_members (
  room_code CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (room_code, user_id),
  KEY ix_group_members_user (user_id),
  CONSTRAINT fk_group_members_room FOREIGN KEY (room_code) REFERENCES group_rooms (code) ON DELETE CASCADE,
  CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  subject    VARCHAR(150) NOT NULL,
  topic      VARCHAR(50) NOT NULL DEFAULT 'general',
  status     ENUM('open','pending','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  last_notified_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_support_tickets_user (user_id, updated_at),
  KEY ix_support_tickets_status (status, updated_at),
  CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id  INT UNSIGNED NOT NULL,
  sender_id  INT UNSIGNED NULL,
  is_admin   TINYINT(1) NOT NULL DEFAULT 0,
  body       TEXT NOT NULL,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_support_messages_ticket (ticket_id, id),
  KEY ix_support_messages_unread (is_admin, read_at),
  CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_support_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcasts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title      VARCHAR(150) NOT NULL,
  body       TEXT NOT NULL,
  type       ENUM('info','warning','success') NOT NULL DEFAULT 'info',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_broadcasts_expires (expires_at),
  CONSTRAINT fk_broadcasts_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  name       VARCHAR(64) NOT NULL,
  value      TEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every value is AES-256-GCM encrypted with app_key: base64(iv|tag|ciphertext).
CREATE TABLE IF NOT EXISTS integrations (
  name            VARCHAR(64) NOT NULL,
  value_encrypted TEXT NOT NULL,
  updated_at      DATETIME NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bans (
  user_id    INT UNSIGNED NOT NULL,
  scope      VARCHAR(20) NOT NULL DEFAULT 'app',
  reason     VARCHAR(500) NOT NULL DEFAULT '',
  until      DATETIME NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_bans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_bans_admin FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kept when the admin is deleted (admin_email is denormalised).
CREATE TABLE IF NOT EXISTS admin_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    INT UNSIGNED NULL,
  admin_email VARCHAR(254) NOT NULL DEFAULT '',
  action      VARCHAR(64) NOT NULL,
  target      VARCHAR(255) NOT NULL DEFAULT '',
  details     TEXT NULL,
  ip          VARCHAR(45) NOT NULL DEFAULT '',
  created_at  DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_admin_log_created (created_at),
  CONSTRAINT fk_admin_log_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       CHAR(64) NOT NULL,
  window_start INT UNSIGNED NOT NULL,
  hits         INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at   DATETIME NOT NULL,
  PRIMARY KEY (bucket, window_start),
  KEY ix_rate_limits_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS presence (
  visitor_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id    INT UNSIGNED NULL,
  path       VARCHAR(255) NOT NULL DEFAULT '/',
  last_seen  DATETIME NOT NULL,
  PRIMARY KEY (visitor_id),
  KEY ix_presence_last_seen (last_seen),
  CONSTRAINT fk_presence_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Voice rooms & community ──────────────────────────────────────────────────
-- (docs/API.md «Rooms & community»; created on older installs by app/Core/Migrations.php v4)

-- One row per user who entered the community: gender + birthdate (in users) are locked from then on.
CREATE TABLE IF NOT EXISTS community_profiles (
  user_id        INT UNSIGNED NOT NULL,
  bio            VARCHAR(300) NOT NULL DEFAULT '',
  facebook_url   VARCHAR(255) NULL,
  instagram_url  VARCHAR(255) NULL,
  is_private     TINYINT(1) NOT NULL DEFAULT 0,
  dm_policy      ENUM('everyone','same_gender','friends') NOT NULL DEFAULT 'same_gender',
  muted_types    VARCHAR(500) NOT NULL DEFAULT '',
  claps_sent     INT UNSIGNED NOT NULL DEFAULT 0,
  claps_received INT UNSIGNED NOT NULL DEFAULT 0,
  joined_at      DATETIME NOT NULL,
  updated_at     DATETIME NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_community_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Community suspensions (scope community = rooms, groups, friends, DMs) and rooms-only bans. App-wide bans stay in `bans`.
CREATE TABLE IF NOT EXISTS community_bans (
  user_id    INT UNSIGNED NOT NULL,
  scope      ENUM('rooms','community') NOT NULL DEFAULT 'community',
  source     ENUM('dictionary','admin') NOT NULL DEFAULT 'admin',
  reason     VARCHAR(500) NOT NULL DEFAULT '',
  until      DATETIME NULL,
  locked     TINYINT(1) NOT NULL DEFAULT 0,
  report_id  BIGINT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id),
  KEY ix_community_bans_source (source, locked),
  CONSTRAINT fk_community_bans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_bans_admin FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follows (
  follower_id INT UNSIGNED NOT NULL,
  followee_id INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  KEY ix_follows_followee (followee_id),
  CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_followee FOREIGN KEY (followee_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Symmetric: one row per direction.
CREATE TABLE IF NOT EXISTS friendships (
  user_id    INT UNSIGNED NOT NULL,
  friend_id  INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  KEY ix_friendships_friend (friend_id),
  CONSTRAINT fk_friendships_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_friendships_friend FOREIGN KEY (friend_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friend_requests (
  from_id    INT UNSIGNED NOT NULL,
  to_id      INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (from_id, to_id),
  KEY ix_friend_requests_to (to_id, created_at),
  CONSTRAINT fk_friend_requests_from FOREIGN KEY (from_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_requests_to FOREIGN KEY (to_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INT UNSIGNED NOT NULL,
  blocked_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  KEY ix_blocks_blocked (blocked_id),
  CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Directed claps (who clapped for whom, how often; last_at enforces once a minute per pair).
CREATE TABLE IF NOT EXISTS clap_tallies (
  from_id INT UNSIGNED NOT NULL,
  to_id   INT UNSIGNED NOT NULL,
  claps   INT UNSIGNED NOT NULL DEFAULT 0,
  last_at DATETIME(3) NOT NULL,
  PRIMARY KEY (from_id, to_id),
  KEY ix_clap_tallies_to (to_id, claps),
  CONSTRAINT fk_clap_tallies_from FOREIGN KEY (from_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_clap_tallies_to FOREIGN KEY (to_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Community groups («الجروبات»; not the group-khatma rooms above).
CREATE TABLE IF NOT EXISTS cgroups (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(80) NOT NULL,
  description  VARCHAR(500) NOT NULL DEFAULT '',
  privacy      ENUM('public','private') NOT NULL DEFAULT 'public',
  gender_scope ENUM('men','women','mixed') NOT NULL,
  photo_file   VARCHAR(100) NULL,
  founder_id   INT UNSIGNED NULL,
  member_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL,
  updated_at   DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_cgroups_discover (privacy, gender_scope, member_count),
  CONSTRAINT fk_cgroups_founder FOREIGN KEY (founder_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- perms: bit flags (1 open rooms, 2 schedule rooms, 4 accept members, 8 kick, 16 edit info/photo, 32 assign moderators).
CREATE TABLE IF NOT EXISTS cgroup_members (
  group_id  INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  role      ENUM('founder','moderator','member') NOT NULL DEFAULT 'member',
  perms     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (group_id, user_id),
  KEY ix_cgroup_members_user (user_id),
  CONSTRAINT fk_cgroup_members_group FOREIGN KEY (group_id) REFERENCES cgroups (id) ON DELETE CASCADE,
  CONSTRAINT fk_cgroup_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- request = the user asked to join a private group; invite = a moderator invited the user.
CREATE TABLE IF NOT EXISTS cgroup_requests (
  group_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  kind       ENUM('request','invite') NOT NULL,
  invited_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (group_id, user_id),
  KEY ix_cgroup_requests_user (user_id),
  CONSTRAINT fk_cgroup_requests_group FOREIGN KEY (group_id) REFERENCES cgroups (id) ON DELETE CASCADE,
  CONSTRAINT fk_cgroup_requests_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_cgroup_requests_inviter FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cgroup_follows (
  group_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (group_id, user_id),
  KEY ix_cgroup_follows_user (user_id),
  CONSTRAINT fk_cgroup_follows_group FOREIGN KEY (group_id) REFERENCES cgroups (id) ON DELETE CASCADE,
  CONSTRAINT fk_cgroup_follows_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Live audio rooms (LiveKit room name: nq-room-<id>). Nothing is recorded.
CREATE TABLE IF NOT EXISTS rooms (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id         INT UNSIGNED NULL,
  group_id         INT UNSIGNED NULL,
  title            VARCHAR(120) NOT NULL,
  gender_scope     ENUM('men','women','mixed') NOT NULL,
  visibility       ENUM('public_by_type','group_members') NOT NULL DEFAULT 'public_by_type',
  status           ENUM('scheduled','open','closed','cancelled') NOT NULL,
  scheduled_at     DATETIME NULL,
  opened_at        DATETIME NULL,
  closed_at        DATETIME NULL,
  close_reason     VARCHAR(32) NULL,
  locked           TINYINT(1) NOT NULL DEFAULT 0,
  shared_surah     TINYINT UNSIGNED NULL,
  shared_ayah      SMALLINT UNSIGNED NULL,
  shared_page      SMALLINT UNSIGNED NULL,
  shared_by        INT UNSIGNED NULL,
  shared_at        DATETIME NULL,
  listener_count   INT UNSIGNED NOT NULL DEFAULT 0,
  speaker_count    INT UNSIGNED NOT NULL DEFAULT 0,
  peak_count       INT UNSIGNED NOT NULL DEFAULT 0,
  no_speaker_since DATETIME NULL,
  reminded_at      DATETIME NULL,
  created_at       DATETIME NOT NULL,
  updated_at       DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_rooms_status (status, gender_scope, opened_at),
  KEY ix_rooms_owner (owner_id, status),
  KEY ix_rooms_group (group_id, status),
  KEY ix_rooms_schedule (status, scheduled_at),
  CONSTRAINT fk_rooms_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_rooms_group FOREIGN KEY (group_id) REFERENCES cgroups (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Presence and roles while a room is open (deleted when it closes).
CREATE TABLE IF NOT EXISTS room_participants (
  room_id          INT UNSIGNED NOT NULL,
  user_id          INT UNSIGNED NOT NULL,
  role             ENUM('owner','moderator','speaker','listener') NOT NULL DEFAULT 'listener',
  present          TINYINT(1) NOT NULL DEFAULT 0,
  hand_raised_at   DATETIME NULL,
  kicked           TINYINT(1) NOT NULL DEFAULT 0,
  last_reaction_at DATETIME(3) NULL,
  joined_at        DATETIME NOT NULL,
  left_at          DATETIME NULL,
  PRIMARY KEY (room_id, user_id),
  KEY ix_room_participants_user (user_id, present),
  CONSTRAINT fk_room_participants_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_room_participants_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Room chat: deleted when the room closes, except reported messages (kept until an admin decides).
CREATE TABLE IF NOT EXISTS room_messages (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  kind       ENUM('chat','system') NOT NULL DEFAULT 'chat',
  event      VARCHAR(20) NULL,
  body       VARCHAR(1000) NOT NULL,
  reported   TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_room_messages_room (room_id, id),
  CONSTRAINT fk_room_messages_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_room_messages_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- «ذكّرني» for scheduled rooms.
CREATE TABLE IF NOT EXISTS room_reminders (
  room_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (room_id, user_id),
  KEY ix_room_reminders_user (user_id),
  CONSTRAINT fk_room_reminders_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_room_reminders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Direct messages: user_low < user_high. updated_at (ms) drives the inbox ETag.
CREATE TABLE IF NOT EXISTS conversations (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_low        INT UNSIGNED NOT NULL,
  user_high       INT UNSIGNED NOT NULL,
  started_by      INT UNSIGNED NOT NULL,
  last_message_id BIGINT UNSIGNED NULL,
  low_read_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  high_read_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_pair (user_low, user_high),
  KEY ix_conversations_high (user_high, updated_at),
  KEY ix_conversations_low (user_low, updated_at),
  CONSTRAINT fk_conversations_low FOREIGN KEY (user_low) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_high FOREIGN KEY (user_high) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deleting a message/conversation removes rows for both sides, except reported ones: those keep the text for the
-- admins (deleted_at set, conversation_id may become NULL) until an admin deletes them.
CREATE TABLE IF NOT EXISTS dm_messages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED NULL,
  sender_id       INT UNSIGNED NULL,
  recipient_id    INT UNSIGNED NULL,
  body            VARCHAR(2000) NOT NULL,
  reported        TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at      DATETIME NULL,
  created_at      DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_dm_messages_conv (conversation_id, id),
  CONSTRAINT fk_dm_messages_conv FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE SET NULL,
  CONSTRAINT fk_dm_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_dm_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin dictionary: severe = never delivered + automatic suspension; possible = held for review.
CREATE TABLE IF NOT EXISTS dictionary_words (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  word       VARCHAR(100) NOT NULL,
  normalized VARCHAR(200) NOT NULL,
  level      ENUM('severe','possible') NOT NULL,
  note       VARCHAR(255) NOT NULL DEFAULT '',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dictionary_normalized (normalized),
  CONSTRAINT fk_dictionary_admin FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Text stopped by the dictionary (evidence; never delivered).
CREATE TABLE IF NOT EXISTS held_content (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NULL,
  context    ENUM('room_chat','dm','room_title','group_name','group_description','bio') NOT NULL,
  context_id BIGINT UNSIGNED NULL,
  body       TEXT NOT NULL,
  level      ENUM('severe','possible') NOT NULL,
  matched    VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_held_content_user (user_id, id),
  CONSTRAINT fk_held_content_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reports by users and by the dictionary. snapshot = the reported content as it was (JSON).
CREATE TABLE IF NOT EXISTS reports (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id    INT UNSIGNED NULL,
  source         ENUM('user','dictionary') NOT NULL DEFAULT 'user',
  level          ENUM('severe','possible') NULL,
  target_type    ENUM('user','room_message','dm_message','room','photo','group','group_photo','held') NOT NULL,
  target_id      BIGINT UNSIGNED NOT NULL,
  target_user_id INT UNSIGNED NULL,
  reason         VARCHAR(32) NOT NULL,
  details        VARCHAR(1000) NOT NULL DEFAULT '',
  snapshot       TEXT NULL,
  status         ENUM('open','dismissed','actioned') NOT NULL DEFAULT 'open',
  decision       VARCHAR(32) NULL,
  decision_note  VARCHAR(500) NULL,
  decided_by     INT UNSIGNED NULL,
  decided_at     DATETIME NULL,
  created_at     DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_reports_status (status, id),
  KEY ix_reports_target (target_type, target_id),
  KEY ix_reports_user (target_user_id),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_target_user FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_admin FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Push tokens registered by the app (FCM registration token or APNs device token).
CREATE TABLE IF NOT EXISTS devices (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  provider     ENUM('fcm','apns') NOT NULL,
  token        VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  platform     ENUM('android','ios','web') NOT NULL DEFAULT 'android',
  app_version  VARCHAR(32) NOT NULL DEFAULT '',
  created_at   DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_devices_token (token),
  KEY ix_devices_user (user_id),
  CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       VARCHAR(32) NOT NULL,
  title      VARCHAR(150) NOT NULL DEFAULT '',
  body       VARCHAR(500) NOT NULL DEFAULT '',
  data       TEXT NULL,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_notifications_user (user_id, id),
  KEY ix_notifications_created (created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per device per notification; drained after responses and by tools/push-worker.php.
CREATE TABLE IF NOT EXISTS push_queue (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id       INT UNSIGNED NOT NULL,
  payload         TEXT NOT NULL,
  status          ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
  attempts        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  claim           CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  claimed_at      DATETIME NULL,
  next_attempt_at DATETIME NOT NULL,
  last_error      VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL,
  sent_at         DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_push_queue_status (status, next_attempt_at),
  KEY ix_push_queue_claim (claim),
  CONSTRAINT fk_push_queue_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Upgrades for databases created by an older version of this file ─────────
-- Portable "ADD COLUMN IF NOT EXISTS" (works on MySQL 8 and MariaDB). The API also applies these
-- automatically at runtime (app/Core/Migrations.php), so importing this file again is optional.

-- support_tickets.last_notified_at: limits "new message from the team" emails to one per ticket per 10 minutes
SET @nq_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE support_tickets ADD COLUMN last_notified_at DATETIME NULL AFTER updated_at', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'last_notified_at');
PREPARE nq_stmt FROM @nq_sql;
EXECUTE nq_stmt;
DEALLOCATE PREPARE nq_stmt;

-- users.lang: language of the account's emails (ar, en, tr, fr, ur, id)
SET @nq_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD COLUMN lang VARCHAR(5) NOT NULL DEFAULT ''ar'' AFTER name', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'lang');
PREPARE nq_stmt FROM @nq_sql;
EXECUTE nq_stmt;
DEALLOCATE PREPARE nq_stmt;

-- oauth_states.lang: UI language carried through Google sign-in (for the welcome email of new accounts)
SET @nq_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE oauth_states ADD COLUMN lang VARCHAR(5) NULL AFTER client', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oauth_states' AND COLUMN_NAME = 'lang');
PREPARE nq_stmt FROM @nq_sql;
EXECUTE nq_stmt;
DEALLOCATE PREPARE nq_stmt;

-- users.avatar_file: uploaded profile photo (file name in storage/avatars; avatar_url keeps the Google picture)
SET @nq_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD COLUMN avatar_file VARCHAR(100) NULL AFTER avatar_url', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_file');
PREPARE nq_stmt FROM @nq_sql;
EXECUTE nq_stmt;
DEALLOCATE PREPARE nq_stmt;
