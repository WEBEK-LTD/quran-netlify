<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Runtime schema upgrades for installs created from an older schema.sql.
 *
 * schema.sql stays the source of truth (fresh installs and phpMyAdmin imports get every column).
 * Servers that only received new app/ files are upgraded here: each change is checked against
 * information_schema and applied only when missing. Once everything is in place a small marker file
 * in storage/ records the version, so normal requests cost one file read and no queries.
 */
final class Migrations
{
    /** Bump when a step is added below. */
    public const VERSION = 2;

    /** Whether every column of VERSION is known to exist (false only when an upgrade failed). */
    private static bool $ready = true;

    /** Code writing new columns checks this, so a failed upgrade never breaks signups or logins. */
    public static function ready(): bool
    {
        self::ensure();
        return self::$ready;
    }

    public static function ensure(): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $checked = true;
        $db = Config::db();
        $marker = Config::storageDir() . '/schema-' . substr(hash('sha256', $db['host'] . '|' . $db['port'] . '|' . $db['name']), 0, 12) . '.version';
        if (is_file($marker) && (int) @file_get_contents($marker) >= self::VERSION) {
            return;
        }
        try {
            self::apply();
            @file_put_contents($marker, (string) self::VERSION, LOCK_EX);
        } catch (\Throwable $e) {
            self::$ready = false;
            // never break the request; the next request retries
            error_log('[nq] schema migration failed: ' . $e->getMessage());
        }
    }

    private static function apply(): void
    {
        // v1: throttle for "new message from the team" emails
        self::addColumn('support_tickets', 'last_notified_at', 'DATETIME NULL AFTER updated_at');
        // v2: language of the account's emails, and the language carried through Google sign-in
        self::addColumn('users', 'lang', "VARCHAR(5) NOT NULL DEFAULT 'ar' AFTER name");
        self::addColumn('oauth_states', 'lang', 'VARCHAR(5) NULL AFTER client');
    }

    private static function addColumn(string $table, string $column, string $definition): void
    {
        $tableExists = (int) Db::value(
            'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            [$table]
        ) > 0;
        if (!$tableExists) {
            return; // created later by schema.sql, which already has the column
        }
        $has = (int) Db::value(
            'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$table, $column]
        ) > 0;
        if ($has) {
            return;
        }
        try {
            Db::exec('ALTER TABLE `' . $table . '` ADD COLUMN `' . $column . '` ' . $definition);
        } catch (\PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1060) { // 1060 = duplicate column: another request won the race
                throw $e;
            }
        }
    }
}
