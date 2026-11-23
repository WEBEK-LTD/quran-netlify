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
  hifz_completed      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL,
  updated_at          DATETIME NULL,
  last_seen_at        DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google_sub (google_sub),
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
