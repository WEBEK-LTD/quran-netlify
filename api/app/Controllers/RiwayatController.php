<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Quran;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Riwayat;
use NQ\Core\Settings;

/** Public data for the «الإجازة والقراءات» page: riwayat texts and the reciters of each riwaya. */
final class RiwayatController
{
    /** GET /riwayat/text/{edition}/{surah} → {edition, surah, ayahs:[…]} (cached forever on the server). */
    public static function text(Request $r): Reply
    {
        Settings::requireFeature('ijaza');
        $edition = $r->param('edition');
        if (!Riwayat::validEdition($edition)) {
            throw ApiError::notFound('هذه الرواية غير متاحة.');
        }
        $surah = $r->intParam('surah');
        if ($surah < 1 || $surah > 114) {
            throw ApiError::notFound('السورة غير موجودة.');
        }
        $ayahs = Riwayat::cachedText($edition, $surah);
        if ($ayahs === null) {
            RateLimit::hit('riwayat', RateLimit::subjects($r));
            $ayahs = Riwayat::fetchText($edition, $surah);
        }
        if ($ayahs === null || count($ayahs) !== Quran::ayahCount($surah)) {
            throw new ApiError(502, 'upstream', 'تعذّر تحميل نص هذه الرواية الآن. يرجى المحاولة لاحقاً.');
        }
        return new Reply(['edition' => $edition, 'surah' => $surah, 'ayahs' => $ayahs], 200, [
            'Cache-Control' => 'public, max-age=604800',
        ]);
    }

    /** GET /riwayat/audio → {updated_at, stale, rawis:{<id>:[{reciter, moshaf, server, surahs, …}]}}. */
    public static function audio(Request $r): Reply
    {
        Settings::requireFeature('ijaza');
        $map = Riwayat::audioMap();
        if ($map === null) {
            throw new ApiError(502, 'upstream', 'تعذّر تحميل قائمة القرّاء الآن. يرجى المحاولة لاحقاً.');
        }
        return new Reply($map, 200, ['Cache-Control' => 'public, max-age=3600']);
    }
}
