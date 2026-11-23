<?php
declare(strict_types=1);

namespace NQ\Core;

use PDO;
use PDOStatement;

/** Thin PDO wrapper. Every query goes through prepared statements with typed bindings. */
final class Db
{
    private static ?PDO $pdo = null;

    /** @param array<string,mixed> $cfg */
    public static function connect(array $cfg): PDO
    {
        $charset = preg_replace('/[^a-z0-9]/i', '', (string) ($cfg['charset'] ?? 'utf8mb4')) ?: 'utf8mb4';
        $host = (string) ($cfg['host'] ?? 'localhost');
        $dsn = 'mysql:host=' . $host . ';port=' . (int) ($cfg['port'] ?? 3306)
            . ';dbname=' . (string) $cfg['name'] . ';charset=' . $charset;
        $pdo = new PDO($dsn, (string) $cfg['user'], (string) $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("SET NAMES {$charset} COLLATE {$charset}_unicode_ci");
        return $pdo;
    }

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            self::$pdo = self::connect(Config::db());
        }
        return self::$pdo;
    }

    public static function setPdo(PDO $pdo): void
    {
        self::$pdo = $pdo;
    }

    /** @param array<int|string,mixed> $params */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        foreach ($params as $k => $v) {
            $name = is_int($k) ? $k + 1 : (str_starts_with($k, ':') ? $k : ':' . $k);
            $type = match (true) {
                is_int($v) => PDO::PARAM_INT,
                is_bool($v) => PDO::PARAM_INT,
                $v === null => PDO::PARAM_NULL,
                default => PDO::PARAM_STR,
            };
            $st->bindValue($name, is_bool($v) ? (int) $v : $v, $type);
        }
        $st->execute();
        return $st;
    }

    /** @return array<string,mixed>|null */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string,mixed>> */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function value(string $sql, array $params = []): mixed
    {
        $v = self::run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function exec(string $sql, array $params = []): int
    {
        return self::run($sql, $params)->rowCount();
    }

    public static function insert(string $sql, array $params = []): int
    {
        self::run($sql, $params);
        return (int) self::pdo()->lastInsertId();
    }

    /** @template T @param callable():T $fn @return T */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) {
            return $fn();
        }
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** UTC "Y-m-d H:i:s" for now (+ optional seconds). */
    public static function now(int $plusSeconds = 0): string
    {
        return gmdate('Y-m-d H:i:s', time() + $plusSeconds);
    }

    /** Convert a DB DATETIME (UTC) to ISO 8601, or null. */
    public static function iso(?string $dt): ?string
    {
        if ($dt === null || $dt === '') {
            return null;
        }
        $ts = strtotime($dt . ' UTC');
        if ($ts === false) {
            return null;
        }
        $ms = '';
        if (preg_match('/\.(\d{1,6})$/', $dt, $m)) {
            $ms = '.' . str_pad(substr($m[1], 0, 3), 3, '0');
        }
        return gmdate('Y-m-d\TH:i:s', $ts) . $ms . 'Z';
    }

    /** Escape LIKE wildcards in a user-supplied search string. */
    public static function likeEscape(string $s): string
    {
        return addcslashes($s, '\\%_');
    }

    /**
     * Run a .sql file made of `;`-terminated statements (no procedures/delimiters).
     */
    public static function runSqlFile(PDO $pdo, string $file): int
    {
        $sql = (string) file_get_contents($file);
        $lines = [];
        foreach (preg_split('/\R/', $sql) ?: [] as $line) {
            $t = ltrim($line);
            if ($t === '' || str_starts_with($t, '--') || str_starts_with($t, '#')) {
                continue;
            }
            $lines[] = $line;
        }
        $count = 0;
        foreach (preg_split('/;\s*(?:\R|$)/', implode("\n", $lines)) ?: [] as $stmt) {
            $stmt = trim($stmt);
            if ($stmt === '') {
                continue;
            }
            $pdo->exec($stmt);
            $count++;
        }
        return $count;
    }
}
