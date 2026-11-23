<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * The qira'at data behind the «الإجازة والقراءات» page:
 *  - texts: King Fahd Complex riwayat published by fawazahmed0/quran-api (jsDelivr, raw.githubusercontent fallback),
 *    cached forever in storage/cache/riwayat/<edition>-<surah>.json as a compact ["ayah 1", "ayah 2", …];
 *  - audio: the mp3quran.net v3 reciters list, mapped to our 20 rawis, refreshed at most once a day.
 *
 * Upstream base URLs can be overridden in config.php for local tests (riwayat_upstream_text, riwayat_upstream_audio).
 */
final class Riwayat
{
    /** The 8 riwayat with a published digital text. */
    public const EDITIONS = [
        'ara-quranuthmanihaf', 'ara-quranshouba', 'ara-quranwarsh', 'ara-quranqaloon',
        'ara-quranbazzi', 'ara-quranqumbul', 'ara-qurandoori', 'ara-quransoosi',
    ];

    public const TEXT_UPSTREAMS = [
        'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions',
        'https://raw.githubusercontent.com/fawazahmed0/quran-api/1/editions',
    ];
    public const AUDIO_UPSTREAMS = [
        'https://mp3quran.net/api/v3',
        'https://www.mp3quran.net/api/v3',
    ];

    public const AUDIO_TTL = 86400;        // refresh the reciters list at most once a day
    public const AUDIO_RETRY = 600;        // after a failed refresh, keep serving the stale copy this long before retrying

    /**
     * Our 20 rawis → how to recognise them in an mp3quran moshaf name (normalised Arabic, see norm()).
     * `rawi`: words that name the narrator (any one); `imam`: when set, one of these must also appear
     * (to tell al-Duri ʿan Abi ʿAmr from al-Duri ʿan al-Kisaʾi, Khalaf ʿan Hamza from Khalaf al-ʿAshir…);
     * `not`: words that rule the match out.
     */
    public const RAWIS = [
        // mp3quran lists its Hafs mujawwad / teaching recordings as «المصحف المجود» / «المصحف المعلم»
        'hafs'         => ['rawi' => ['حفص', 'المصحف المجود', 'المصحف المعلم'], 'not' => ['الدوري']],
        'shuba'        => ['rawi' => ['شعبه']],
        'qalun'        => ['rawi' => ['قالون']],
        'warsh'        => ['rawi' => ['ورش']],
        'bazzi'        => ['rawi' => ['البزي', 'بزي']],
        'qunbul'       => ['rawi' => ['قنبل']],
        'duri_abuamr'  => ['rawi' => ['الدوري', 'دوري'], 'imam' => ['عمرو', 'البصري']],
        'susi'         => ['rawi' => ['السوسي', 'سوسي']],
        'hisham'       => ['rawi' => ['هشام']],
        'ibndhakwan'   => ['rawi' => ['ابن ذكوان', 'ذكوان']],
        'khalaf_hamza' => ['rawi' => ['خلف'], 'imam' => ['حمزه'], 'not' => ['العاشر']],
        'khallad'      => ['rawi' => ['خلاد']],
        'abulharith'   => ['rawi' => ['الحارث']],
        'duri_kisai'   => ['rawi' => ['الدوري', 'دوري'], 'imam' => ['الكسائي', 'كسائي']],
        'ibnwardan'    => ['rawi' => ['ابن وردان', 'وردان']],
        'ibnjammaz'    => ['rawi' => ['ابن جماز', 'جماز']],
        'ruways'       => ['rawi' => ['رويس']],
        'rawh'         => ['rawi' => ['روح']],
        'ishaq'        => ['rawi' => ['اسحاق']],
        'idris'        => ['rawi' => ['ادريس']],
    ];

    // ─── texts ──────────────────────────────────────────────────────────────

    public static function validEdition(string $edition): bool
    {
        return in_array($edition, self::EDITIONS, true);
    }

    public static function textCacheFile(string $edition, int $surah): string
    {
        return Config::storageDir('cache/riwayat') . '/' . $edition . '-' . $surah . '.json';
    }

    /** Cached ayahs of a surah, or null when not cached yet. @return list<string>|null */
    public static function cachedText(string $edition, int $surah): ?array
    {
        $file = self::textCacheFile($edition, $surah);
        if (!is_file($file)) {
            return null;
        }
        $a = json_decode((string) @file_get_contents($file), true);
        return is_array($a) && count($a) === Quran::ayahCount($surah) ? array_values($a) : null;
    }

    /**
     * Fetch a surah from the upstreams (first that answers with a valid body wins) and cache it.
     * @param list<string> $log receives one line per upstream tried
     * @return list<string>|null
     */
    public static function fetchText(string $edition, int $surah, array &$log = []): ?array
    {
        foreach (self::upstreams('riwayat_upstream_text', self::TEXT_UPSTREAMS) as $base) {
            $url = $base . '/' . $edition . '/' . $surah . '.json';
            $res = Http::request('GET', $url, ['Accept' => 'application/json'], null, 20, self::isLocal($url), 4_000_000);
            $ayahs = $res['status'] === 200 ? self::parseText($res['json'], $surah) : null;
            $log[] = sprintf('%s → HTTP %d%s', $url, $res['status'], $ayahs === null ? ' (unusable' . ($res['error'] !== '' ? ': ' . $res['error'] : '') . ')' : ' ok, ' . count($ayahs) . ' ayahs');
            if ($ayahs !== null) {
                self::writeAtomic(self::textCacheFile($edition, $surah), (string) json_encode($ayahs, JSON_UNESCAPED_UNICODE));
                return $ayahs;
            }
        }
        return null;
    }

    /** Validate {"chapter":[{"chapter":S,"verse":1,"text":"…"},…]} and return the cleaned texts in order. @return list<string>|null */
    public static function parseText(mixed $json, int $surah): ?array
    {
        $rows = is_array($json) ? ($json['chapter'] ?? null) : null;
        $count = Quran::ayahCount($surah);
        if (!is_array($rows) || count($rows) !== $count) {
            return null;
        }
        $out = [];
        foreach (array_values($rows) as $i => $row) {
            if (!is_array($row) || (int) ($row['chapter'] ?? 0) !== $surah || (int) ($row['verse'] ?? 0) !== $i + 1
                || !is_string($row['text'] ?? null)) {
                return null;
            }
            $t = self::cleanText($row['text']);
            if ($t === '' || !preg_match('/\p{Arabic}/u', $t)) {
                return null;
            }
            $out[] = $t;
        }
        return $out;
    }

    /**
     * Remove invisible direction marks / BOM and repair one artefact of the published texts: a space wrongly
     * inserted between a tanween (or the imala dot) and the final alif / alif maqsura of the same word
     * («هُدࣰ ى» → «هُدࣰى»). Letters and marks themselves are never changed.
     */
    public static function cleanText(string $t): string
    {
        $t = (string) preg_replace('/[\x{200E}\x{200F}\x{FEFF}\x{202A}-\x{202E}]/u', '', $t);
        $t = (string) preg_replace('/([\x{064B}-\x{064D}\x{065C}\x{08F0}-\x{08F2}][\x{0610}-\x{061A}\x{064B}-\x{065F}\x{0670}\x{06D6}-\x{06ED}]*) ([\x{0627}\x{0649}\x{064A}][\x{0670}\x{0653}]*)(?=[\x{06D6}-\x{06ED}]*(?:\s|$))/u', '$1$2', $t);
        return trim((string) preg_replace('/\s+/u', ' ', $t));
    }

    // ─── audio ──────────────────────────────────────────────────────────────

    public static function audioCacheFile(): string
    {
        return Config::storageDir('cache/riwayat') . '/audio-map.json';
    }

    /**
     * The rawi → reciters map, refreshed from mp3quran at most once per AUDIO_TTL; a stale copy is served when the
     * refresh fails. Null only when nothing was ever fetched and the upstream is unreachable.
     * @return array{updated_at:string, stale:bool, rawis:array<string,list<array<string,mixed>>>}|null
     */
    public static function audioMap(): ?array
    {
        $file = self::audioCacheFile();
        $cached = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
        $cached = is_array($cached) && isset($cached['fetched_at'], $cached['rawis']) ? $cached : null;
        $now = time();
        $fresh = $cached !== null && $now - (int) $cached['fetched_at'] < self::AUDIO_TTL;
        $failedAt = is_file($file . '.failed') ? (int) @file_get_contents($file . '.failed') : 0;
        if ($fresh || $now - $failedAt < self::AUDIO_RETRY) {
            return $cached !== null ? self::audioShape($cached, !$fresh) : null;
        }
        // one refresh at a time; others serve what is cached
        $lock = @fopen($file . '.lock', 'c');
        if ($lock !== false && !flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            return $cached !== null ? self::audioShape($cached, true) : null;
        }
        try {
            $reciters = self::fetchReciters();
            if ($reciters !== null) {
                $map = self::buildAudioMap($reciters);
                $doc = ['fetched_at' => $now, 'rawis' => $map['rawis']];
                self::writeAtomic($file, (string) json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                @unlink($file . '.failed');
                return self::audioShape($doc, false);
            }
            self::writeAtomic($file . '.failed', (string) $now);
            return $cached !== null ? self::audioShape($cached, true) : null;
        } finally {
            if ($lock !== false) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    /** @param array<string,mixed> $doc */
    private static function audioShape(array $doc, bool $stale): array
    {
        $rawis = [];
        foreach (array_keys(self::RAWIS) as $id) {
            $rawis[$id] = array_values((array) ($doc['rawis'][$id] ?? []));
        }
        return ['updated_at' => gmdate('Y-m-d\TH:i:s\Z', (int) $doc['fetched_at']), 'stale' => $stale, 'rawis' => $rawis];
    }

    /**
     * GET <base>/reciters?language=ar from the first upstream that answers with a reciters list.
     * @param list<string> $log
     * @return list<array<string,mixed>>|null
     */
    public static function fetchReciters(array &$log = []): ?array
    {
        foreach (self::upstreams('riwayat_upstream_audio', self::AUDIO_UPSTREAMS) as $base) {
            $url = $base . '/reciters?language=ar';
            $res = Http::request('GET', $url, ['Accept' => 'application/json'], null, 30, self::isLocal($url), 20_000_000);
            $list = is_array($res['json']) ? ($res['json']['reciters'] ?? null) : null;
            $ok = $res['status'] === 200 && is_array($list) && $list !== [];
            $log[] = sprintf('%s → HTTP %d%s', $url, $res['status'], $ok ? ' ok, ' . count($list) . ' reciters' : ' (unusable' . ($res['error'] !== '' ? ': ' . $res['error'] : '') . ')');
            if ($ok) {
                return array_values(array_filter($list, 'is_array'));
            }
        }
        return null;
    }

    /**
     * Map mp3quran reciters to our rawis. Pure function (no I/O) so tests and the CLI check can use it.
     * @param list<array<string,mixed>> $reciters
     * @return array{rawis:array<string,list<array<string,mixed>>>, unmatched:array<string,int>}
     */
    public static function buildAudioMap(array $reciters): array
    {
        $rawis = array_fill_keys(array_keys(self::RAWIS), []);
        $unmatched = [];
        $seen = [];
        foreach ($reciters as $rec) {
            $reciter = trim((string) ($rec['name'] ?? ''));
            foreach ((array) ($rec['moshaf'] ?? []) as $m) {
                if (!is_array($m)) {
                    continue;
                }
                $moshaf = trim((string) ($m['name'] ?? ''));
                $server = self::cleanServer((string) ($m['server'] ?? ''));
                $surahs = self::parseSurahList($m['surah_list'] ?? '');
                if ($reciter === '' || $moshaf === '' || $server === null || $surahs === []) {
                    continue;
                }
                $ids = self::matchRawis($moshaf);
                if ($ids === []) {
                    $key = self::riwayaPart($moshaf);
                    $unmatched[$key] = ($unmatched[$key] ?? 0) + 1;
                    continue;
                }
                foreach ($ids as $id) {
                    if (isset($seen[$id][$server])) {
                        continue;
                    }
                    $seen[$id][$server] = true;
                    $rawis[$id][] = [
                        'reciter' => $reciter,
                        'reciter_id' => (int) ($rec['id'] ?? 0),
                        'moshaf' => $moshaf,
                        'moshaf_id' => (int) ($m['id'] ?? 0),
                        'style' => self::style($moshaf),
                        'combined' => count($ids) > 1,
                        'server' => $server,
                        'surahs' => $surahs,
                    ];
                }
            }
        }
        $rank = ['murattal' => 0, null => 1, 'mujawwad' => 2, 'muallim' => 3];
        foreach ($rawis as &$list) {
            usort($list, static fn (array $a, array $b): int => [(int) $a['combined'], $rank[$a['style']] ?? 1, -count($a['surahs']), $a['reciter']]
                <=> [(int) $b['combined'], $rank[$b['style']] ?? 1, -count($b['surahs']), $b['reciter']]);
        }
        unset($list);
        arsort($unmatched);
        return ['rawis' => $rawis, 'unmatched' => $unmatched];
    }

    /** Which of our rawis a moshaf name refers to (several for a combined recitation). @return list<string> */
    public static function matchRawis(string $moshafName): array
    {
        $n = ' ' . self::norm(self::riwayaPart($moshafName)) . ' ';
        $has = static function (string $word) use ($n): bool {
            // whole word, optionally with the conjunction «و» glued to it («البزي وقنبل»)
            return (bool) preg_match('/[\s(]و?' . preg_quote(self::norm($word), '/') . '(?=[\s),،])/u', $n);
        };
        $out = [];
        foreach (self::RAWIS as $id => $rule) {
            $any = static fn (array $words): bool => array_reduce($words, static fn (bool $c, string $w): bool => $c || $has($w), false);
            if (!$any($rule['rawi'])) {
                continue;
            }
            if (isset($rule['imam']) && !$any($rule['imam'])) {
                continue;
            }
            if (isset($rule['not']) && $any($rule['not'])) {
                continue;
            }
            $out[] = $id;
        }
        return $out;
    }

    /** «ورش عن نافع - مرتل» → «ورش عن نافع» (the part before the style). */
    public static function riwayaPart(string $moshafName): string
    {
        $parts = preg_split('/\s+[-–—]\s+/u', trim($moshafName)) ?: [$moshafName];
        // drop parts that only name the style («مرتل», «مجود», «المصحف المعلم»)
        $keep = array_filter($parts, static fn (string $p): bool => self::style($p) === null || mb_strlen(self::norm($p)) > 12);
        return trim(implode(' - ', $keep !== [] ? $keep : $parts));
    }

    public static function style(string $moshafName): ?string
    {
        $n = self::norm($moshafName);
        return match (true) {
            str_contains($n, 'مرتل') => 'murattal',
            str_contains($n, 'مجود') => 'mujawwad',
            str_contains($n, 'معلم') => 'muallim',
            default => null,
        };
    }

    /** Arabic without diacritics/tatweel, one form of alif/ya/ta marbuta, single spaces. */
    public static function norm(string $s): string
    {
        $s = (string) preg_replace('/[\x{0610}-\x{061A}\x{064B}-\x{065F}\x{0670}\x{06D6}-\x{06ED}\x{0640}\x{200C}-\x{200F}]/u', '', $s);
        $s = strtr($s, ['أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ى' => 'ي', 'ة' => 'ه', 'ؤ' => 'و', 'ئ' => 'ي']);
        return trim((string) preg_replace('/\s+/u', ' ', $s));
    }

    /** https only; always ends with «/». */
    public static function cleanServer(string $server): ?string
    {
        $server = trim($server);
        $p = parse_url($server);
        if (!is_array($p) || ($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || isset($p['query']) || isset($p['fragment'])) {
            return null;
        }
        if (!preg_match('/^[a-z0-9.-]+$/i', (string) $p['host'])) {
            return null;
        }
        return rtrim($server, '/') . '/';
    }

    /** "1,2,3" (or a list) → sorted unique surah numbers 1–114. @return list<int> */
    public static function parseSurahList(mixed $list): array
    {
        $items = is_array($list) ? $list : explode(',', (string) $list);
        $out = [];
        foreach ($items as $v) {
            $v = trim((string) $v);
            if (preg_match('/^\d{1,3}$/', $v) && (int) $v >= 1 && (int) $v <= 114) {
                $out[(int) $v] = true;
            }
        }
        $out = array_keys($out);
        sort($out);
        return $out;
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    /** @param list<string> $defaults @return list<string> */
    private static function upstreams(string $key, array $defaults): array
    {
        $v = Config::get($key);
        $list = is_string($v) && $v !== '' ? [$v] : (is_array($v) && $v !== [] ? $v : $defaults);
        return array_values(array_map(static fn ($u): string => rtrim((string) $u, '/'), $list));
    }

    /** Plain http is only ever allowed for a test upstream on this machine. */
    private static function isLocal(string $url): bool
    {
        $p = parse_url($url);
        return is_array($p) && ($p['scheme'] ?? '') === 'http' && in_array($p['host'] ?? '', ['127.0.0.1', 'localhost'], true);
    }

    private static function writeAtomic(string $file, string $contents): void
    {
        $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $contents) !== false) {
            @chmod($tmp, 0600);
            if (!@rename($tmp, $file)) {
                @unlink($tmp);
            }
        }
    }
}
