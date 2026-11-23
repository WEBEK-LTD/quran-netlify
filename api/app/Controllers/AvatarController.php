<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Auth;
use NQ\Core\Avatar;
use NQ\Core\Db;
use NQ\Core\FileReply;
use NQ\Core\Migrations;
use NQ\Core\RateLimit;
use NQ\Core\Request;

/** Profile photo: upload (multipart field `photo`), remove, and serve. */
final class AvatarController
{
    public static function upload(Request $r): array
    {
        $uid = $r->userId();
        if (!Avatar::available() || !Migrations::ready()) {
            throw new ApiError(503, 'avatar_unavailable');
        }
        $ctype = strtolower((string) $r->header('content-type'));
        if (!str_starts_with($ctype, 'multipart/form-data')) {
            throw ApiError::validation(['photo' => 'أرسل الصورة في الحقل photo (multipart/form-data).'], 'اختر صورة لرفعها.');
        }
        $postMax = Avatar::bytes((string) ini_get('post_max_size'));
        if ($postMax > 0 && (int) ($r->header('content-length') ?? 0) > $postMax) {
            // PHP dropped the whole body: bigger than post_max_size on this server
            throw new ApiError(413, 'avatar_too_large');
        }
        RateLimit::hit('avatar', ['user:' . $uid]);

        $file = Avatar::store($uid, $r->file('photo'));
        try {
            $old = Db::tx(static function () use ($uid, $file): ?string {
                $prev = Db::value('SELECT avatar_file FROM users WHERE id = ? FOR UPDATE', [$uid]);
                Db::exec('UPDATE users SET avatar_file = ?, updated_at = ? WHERE id = ?', [$file, Db::now(), $uid]);
                return is_string($prev) ? $prev : null;
            });
        } catch (\Throwable $e) {
            Avatar::delete($file);
            throw $e;
        }
        if ($old !== $file) {
            Avatar::delete($old);
        }
        return ['user' => Auth::shape((array) Auth::findUser($uid))];
    }

    public static function remove(Request $r): array
    {
        $uid = $r->userId();
        if (Migrations::ready()) {
            $old = Db::tx(static function () use ($uid): ?string {
                $prev = Db::value('SELECT avatar_file FROM users WHERE id = ? FOR UPDATE', [$uid]);
                if ($prev !== null) {
                    Db::exec('UPDATE users SET avatar_file = NULL, updated_at = ? WHERE id = ?', [Db::now(), $uid]);
                }
                return is_string($prev) ? $prev : null;
            });
            Avatar::delete($old);
        }
        return ['user' => Auth::shape((array) Auth::findUser($uid))];
    }

    /** GET /avatars/{file} — the re-encoded photo itself (not JSON). Public: URLs are unguessable. */
    public static function serve(Request $r): FileReply
    {
        $file = $r->param('file');
        $path = Avatar::path($file);
        if ($path === null) {
            throw ApiError::notFound('الصورة غير موجودة.');
        }
        return new FileReply($path, str_ends_with($file, '.webp') ? 'image/webp' : 'image/jpeg', [
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'Cross-Origin-Resource-Policy' => 'cross-origin',
            'Content-Disposition' => 'inline; filename="avatar.' . (str_ends_with($file, '.webp') ? 'webp' : 'jpg') . '"',
        ]);
    }
}
