<?php
declare(strict_types=1);

namespace NQ\Core;

/** Ayah counts per surah (Hafs, 6236 ayahs in total). */
final class Quran
{
    public const AYAH_COUNTS = [
        7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
        112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
        54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
        14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
        29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
        11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
    ];
    public const TOTAL_AYAHS = 6236;

    public static function ayahCount(int $surah): int
    {
        return self::AYAH_COUNTS[$surah - 1] ?? 0;
    }

    public static function valid(int $surah, int $ayah): bool
    {
        return $surah >= 1 && $surah <= 114 && $ayah >= 1 && $ayah <= self::ayahCount($surah);
    }

    /** @param array<string,mixed> $b @return array{0:int,1:int} validated [surah, ayah] */
    public static function fromBody(array $b): array
    {
        $surah = (int) V::int($b, 'surah', 1, 114);
        $ayah = (int) V::int($b, 'ayah', 1, 286);
        if ($ayah > self::ayahCount($surah)) {
            throw ApiError::validation(['ayah' => 'رقم الآية غير موجود في هذه السورة.']);
        }
        return [$surah, $ayah];
    }

    /** Validate surah/ayah coming from the URL; 404 if impossible. @return array{0:int,1:int} */
    public static function fromParams(Request $r): array
    {
        $surah = $r->intParam('surah');
        $ayah = $r->intParam('ayah');
        if (!self::valid($surah, $ayah)) {
            throw ApiError::notFound('الآية غير موجودة.');
        }
        return [$surah, $ayah];
    }
}
