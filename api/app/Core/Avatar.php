<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Profile photos: validation, re-encoding with GD, storage outside the web root.
 *
 * Uploads are never kept as sent. Each one is decoded, centre-cropped to a square, resized to
 * 512×512 and re-encoded (WebP when GD can write it, else JPEG), which also drops EXIF/GPS and any
 * bytes hidden in the original. Files live in <app base>/storage/avatars/<user id>-<24 hex>.<ext>
 * (random part: a deleted photo's URL can't be guessed, and every change gets a new URL so
 * `immutable` caching is safe). They are only ever served by GET /v1/avatars/{file}.
 */
final class Avatar
{
    public const MAX_BYTES = 5 * 1024 * 1024;           // raw upload
    public const MAX_REQUEST = self::MAX_BYTES + 262144; // + multipart overhead
    public const MAX_SIDE = 6000;
    public const MIN_SIDE = 64;
    public const SIZE = 512;
    public const QUALITY = 82;
    /** user id, dash, 24 hex chars, extension */
    public const FILE_RE = '/^[1-9][0-9]{0,9}-[a-f0-9]{24}\.(webp|jpg)$/';

    /** Whether this server can re-encode photos (GD with a JPEG or WebP writer). */
    public static function available(): bool
    {
        return extension_loaded('gd') && function_exists('imagecreatetruecolor') && function_exists('imagecopyresampled')
            && (function_exists('imagewebp') || function_exists('imagejpeg'));
    }

    public static function dir(): string
    {
        $dir = Config::storageDir('avatars'); // created 0700 (storage/ is never web-served)
        if (!is_dir($dir) || !is_writable($dir)) {
            throw new \RuntimeException('storage/avatars is not writable');
        }
        return $dir;
    }

    public static function validName(?string $file): bool
    {
        return is_string($file) && preg_match(self::FILE_RE, $file) === 1;
    }

    /** Absolute public URL of a stored photo. */
    public static function url(string $file): string
    {
        return Config::apiUrl() . '/v1/avatars/' . rawurlencode($file);
    }

    /** Full path of a stored photo, or null when the name is invalid or the file is gone. */
    public static function path(string $file): ?string
    {
        if (!self::validName($file)) {
            return null;
        }
        $p = Config::storageDir('avatars') . '/' . $file;
        return is_file($p) ? $p : null;
    }

    public static function delete(?string $file): void
    {
        if ($file !== null && self::validName($file)) {
            $p = Config::storageDir('avatars') . '/' . $file;
            if (is_file($p)) {
                @unlink($p);
            }
        }
    }

    /**
     * Validate the uploaded file and write the re-encoded square photo. Returns the new file name.
     * @param array<string,mixed>|null $upload one entry of $_FILES
     */
    public static function store(int $userId, ?array $upload): string
    {
        if (!self::available()) {
            throw new ApiError(503, 'avatar_unavailable');
        }
        $tmp = self::uploadedTmp($upload);
        $size = (int) @filesize($tmp);
        if ($size <= 0) {
            throw ApiError::validation(['photo' => 'اختر صورة لرفعها.'], 'اختر صورة لرفعها.');
        }
        if ($size > self::MAX_BYTES) {
            throw new ApiError(413, 'avatar_too_large');
        }

        $type = self::sniff($tmp);
        $info = @getimagesize($tmp);
        if (!is_array($info) || ($info[2] ?? null) !== $type) {
            throw new ApiError(422, 'unsupported_image');
        }
        if (function_exists('finfo_open')) {
            $fi = finfo_open(FILEINFO_MIME_TYPE);
            $mime = $fi ? (string) finfo_file($fi, $tmp) : '';
            if ($fi) {
                finfo_close($fi);
            }
            $expected = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_GIF => 'image/gif', IMAGETYPE_WEBP => 'image/webp'];
            if ($mime !== '' && $mime !== $expected[$type]) {
                throw new ApiError(422, 'unsupported_image');
            }
        }
        [$w, $h] = [(int) $info[0], (int) $info[1]];
        if ($w > self::MAX_SIDE || $h > self::MAX_SIDE || $w < self::MIN_SIDE || $h < self::MIN_SIDE) {
            throw new ApiError(422, 'image_dimensions');
        }

        self::reserveMemory($w * $h * 5 + self::SIZE * self::SIZE * 5 + (16 << 20));
        $src = self::decode($tmp, $type);
        try {
            if ($type === IMAGETYPE_JPEG) {
                $src = self::applyExifOrientation($src, $tmp);
            }
            $out = self::squareResize($src);
        } finally {
            unset($src); // GdImage objects free themselves (imagedestroy is a no-op, deprecated in PHP 8.5)
        }

        $webp = function_exists('imagewebp');
        $name = $userId . '-' . bin2hex(random_bytes(12)) . ($webp ? '.webp' : '.jpg');
        $dir = self::dir();
        $part = $dir . '/.tmp-' . bin2hex(random_bytes(8));
        try {
            $ok = $webp ? imagewebp($out, $part, self::QUALITY) : imagejpeg($out, $part, self::QUALITY);
            if (!$ok || !is_file($part) || filesize($part) === 0) {
                throw new \RuntimeException('avatar encode failed');
            }
            @chmod($part, 0600);
            if (!rename($part, $dir . '/' . $name)) {
                throw new \RuntimeException('avatar rename failed');
            }
        } finally {
            unset($out);
            if (is_file($part)) {
                @unlink($part);
            }
        }
        return $name;
    }

    /** @param array<string,mixed>|null $f @return string the temp path of a real upload */
    private static function uploadedTmp(?array $f): string
    {
        if ($f === null || !isset($f['error']) || is_array($f['error'])) {
            throw ApiError::validation(['photo' => 'اختر صورة لرفعها.'], 'اختر صورة لرفعها.');
        }
        $err = (int) $f['error'];
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
            throw new ApiError(413, 'avatar_too_large');
        }
        if ($err === UPLOAD_ERR_NO_FILE || $err === UPLOAD_ERR_PARTIAL) {
            throw ApiError::validation(['photo' => 'اختر صورة لرفعها.'], 'اختر صورة لرفعها.');
        }
        if ($err !== UPLOAD_ERR_OK) {
            error_log('[nq] avatar upload error code ' . $err);
            throw new ApiError(503, 'avatar_unavailable');
        }
        $tmp = (string) ($f['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw ApiError::validation(['photo' => 'اختر صورة لرفعها.'], 'اختر صورة لرفعها.');
        }
        return $tmp;
    }

    /** The image type from the file's magic bytes (never the name or the client's MIME). */
    private static function sniff(string $path): int
    {
        $fh = @fopen($path, 'rb');
        $head = $fh ? (string) fread($fh, 16) : '';
        if ($fh) {
            fclose($fh);
        }
        if (strncmp($head, "\xFF\xD8\xFF", 3) === 0) {
            return IMAGETYPE_JPEG;
        }
        if (strncmp($head, "\x89PNG\r\n\x1A\n", 8) === 0) {
            return IMAGETYPE_PNG;
        }
        if (strncmp($head, 'GIF87a', 6) === 0 || strncmp($head, 'GIF89a', 6) === 0) {
            return IMAGETYPE_GIF;
        }
        if (strncmp($head, 'RIFF', 4) === 0 && substr($head, 8, 4) === 'WEBP') {
            return IMAGETYPE_WEBP;
        }
        throw new ApiError(422, 'unsupported_image');
    }

    /** Make room for decoding (GD keeps 4+ bytes per pixel). Refuse when the host won't allow it. */
    private static function reserveMemory(int $need): void
    {
        $limit = self::bytes((string) ini_get('memory_limit'));
        if ($limit < 0) {
            return; // unlimited
        }
        $want = memory_get_usage(true) + $need;
        if ($want <= $limit) {
            return;
        }
        if ($want <= (512 << 20)) {
            @ini_set('memory_limit', (string) $want);
            if (self::bytes((string) ini_get('memory_limit')) >= $want) {
                return;
            }
        }
        throw new ApiError(422, 'image_dimensions');
    }

    /** php.ini size ("8M", "1G", "-1") in bytes; -1 means unlimited. */
    public static function bytes(string $v): int
    {
        $v = trim($v);
        if ($v === '' || $v === '-1') {
            return -1;
        }
        $n = (int) $v;
        return match (strtolower(substr($v, -1))) {
            'g' => $n << 30,
            'm' => $n << 20,
            'k' => $n << 10,
            default => $n,
        };
    }

    private static function decode(string $path, int $type): \GdImage
    {
        $fn = match ($type) {
            IMAGETYPE_JPEG => 'imagecreatefromjpeg',
            IMAGETYPE_PNG => 'imagecreatefrompng',
            IMAGETYPE_GIF => 'imagecreatefromgif', // first frame
            IMAGETYPE_WEBP => 'imagecreatefromwebp',
            default => '',
        };
        if ($fn === '' || !function_exists($fn)) {
            throw new ApiError(422, 'unsupported_image');
        }
        try {
            $img = @$fn($path);
        } catch (\Throwable) {
            $img = false; // GD warnings become ErrorException via the global handler
        }
        if (!$img instanceof \GdImage) {
            throw new ApiError(422, 'unsupported_image', 'تعذّرت قراءة الصورة. قد يكون الملف تالفاً أو بصيغة غير مدعومة (الصور المتحركة WebP غير مدعومة).');
        }
        return $img;
    }

    /** Phone photos store rotation in EXIF; apply it before EXIF is dropped. */
    private static function applyExifOrientation(\GdImage $img, string $path): \GdImage
    {
        if (!function_exists('exif_read_data')) {
            return $img;
        }
        try {
            $exif = @exif_read_data($path);
        } catch (\Throwable) {
            return $img;
        }
        $o = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        if ($o < 2 || $o > 8) {
            return $img;
        }
        if (in_array($o, [2, 4, 5, 7], true)) {
            imageflip($img, $o === 4 ? IMG_FLIP_VERTICAL : IMG_FLIP_HORIZONTAL);
        }
        $angle = match ($o) {
            3, 4 => 180,
            5, 6 => 270, // imagerotate is counter-clockwise
            7, 8 => 90,
            default => 0,
        };
        if ($angle !== 0) {
            $rot = imagerotate($img, $angle, 0);
            if ($rot instanceof \GdImage) {
                return $rot;
            }
        }
        return $img;
    }

    /** Centre-crop to a square and resample to SIZE×SIZE, keeping transparency for WebP output. */
    private static function squareResize(\GdImage $src): \GdImage
    {
        $w = imagesx($src);
        $h = imagesy($src);
        $side = min($w, $h);
        $sx = intdiv($w - $side, 2);
        $sy = intdiv($h - $side, 2);
        $out = imagecreatetruecolor(self::SIZE, self::SIZE);
        if (!$out instanceof \GdImage) {
            throw new \RuntimeException('imagecreatetruecolor failed');
        }
        if (function_exists('imagewebp')) {
            imagealphablending($out, false);
            imagesavealpha($out, true);
            imagefill($out, 0, 0, (int) imagecolorallocatealpha($out, 0, 0, 0, 127));
        } else {
            imagefill($out, 0, 0, (int) imagecolorallocate($out, 255, 255, 255));
        }
        if (!imageistruecolor($src)) {
            imagepalettetotruecolor($src);
        }
        imagecopyresampled($out, $src, 0, 0, $sx, $sy, self::SIZE, self::SIZE, $side, $side);
        return $out;
    }
}
