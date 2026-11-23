<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * The curated radio catalogue behind GET /v1/radio (the «الإذاعة» page). The 24/7 reciter / tafsir channels of
 * mp3quran.net are merged in at run time by Radio::mp3quranStations(); this list holds the official national Quran
 * radios and a few other channels that the mp3quran API does not list.
 *
 * Each station: id (stable, used for favourites in the browser — never rename one), name_ar, name_en, country (ISO
 * 3166-1 alpha-2, '' when none), category (quran = official Quran radios · recitation = 24/7 reciter channels · tafsir · programs),
 * featured (shown in the top row of official national Quran radios) and `streams`: candidate URLs in order of
 * preference. The server checker (Radio::check, at most every 6 h) gives the browser the first candidate that answers
 * with audio over https. Plain http candidates are only probed server-side: they are usable only when they redirect to
 * https (a browser on an https page blocks http audio as mixed content).
 *
 * HOW SURE WE ARE OF EACH URL — the sandbox this was written in could not reach any of these hosts, so nothing below
 * was tested from here. Run `php tools/check-radio.php` on the server: it prints which candidate works for each station.
 *   [brief]   given in the project brief / widely published as the station's official stream; most likely correct.
 *   [memory]  recalled from public directories (radio-browser.info, station sites); plausible but unverified.
 *   [guess]   a pattern guess (same CDN as the broadcaster's TV/other channels); probably needs replacing —
 *             find the real URL in the station's own web player (browser devtools → Network → media) and put it first.
 * The checker hides a station whose candidates all fail (status `down`), so a wrong guess costs nothing but a line.
 */
final class RadioCatalog
{
    public const CATEGORIES = ['quran', 'recitation', 'tafsir', 'programs'];

    /** @var list<array{id:string,name_ar:string,name_en:string,country:string,category:string,featured?:bool,streams:list<string>}> */
    public const STATIONS = [
        // ── Egypt ───────────────────────────────────────────────────────────────
        [
            'id' => 'eg-cairo-quran', 'country' => 'EG', 'category' => 'quran', 'featured' => true,
            'name_ar' => 'إذاعة القرآن الكريم من القاهرة', 'name_en' => 'Holy Quran Radio — Cairo',
            'streams' => [
                'https://stream.radiojar.com/8s5u5tpdtwzuv',       // [brief] Egyptian Radio and TV Union (Maspero) via Radiojar
                'https://n01.radiojar.com/8s5u5tpdtwzuv',          // [memory] a Radiojar edge node for the same mount
                'http://stream.radiojar.com/8s5u5tpdtwzuv',        // [memory] http mirror — only used if it redirects to https
                'https://radio.xecod.com/station/quran-cairo', // [radio-browser 2026-11] OmniRadio relay of Cairo Quran radio (fallback)
            ],
        ],
        // ── Saudi Arabia ────────────────────────────────────────────────────────
        [
            'id' => 'sa-quran', 'country' => 'SA', 'category' => 'quran', 'featured' => true,
            'name_ar' => 'إذاعة القرآن الكريم من المملكة العربية السعودية', 'name_en' => 'Holy Quran Radio — Saudi Arabia',
            'streams' => [
                'https://stream.radiojar.com/0tpy1h0kxtzuv',       // [brief] Saudi Broadcasting Authority via Radiojar
                'https://n01.radiojar.com/0tpy1h0kxtzuv',          // [memory] Radiojar edge node
            ],
        ],
        [
            'id' => 'sa-makkah-live', 'country' => 'SA', 'category' => 'quran',
            'name_ar' => 'البث المباشر من المسجد الحرام', 'name_en' => 'Live from al-Masjid al-Haram, Makkah',
            'streams' => [
                'https://win.holol.com/live/quran/playlist.m3u8',  // [memory] SBA «قناة القرآن الكريم» live HLS (video; the player uses its audio)
            ],
        ],
        [
            'id' => 'sa-madinah-live', 'country' => 'SA', 'category' => 'quran',
            'name_ar' => 'البث المباشر من المسجد النبوي', 'name_en' => 'Live from al-Masjid an-Nabawi, Madinah',
            'streams' => [
                'https://win.holol.com/live/sunnah/playlist.m3u8', // [memory] SBA «قناة السنة النبوية» live HLS (video; audio used)
            ],
        ],
        [
            'id' => 'sa-nidaa-islam', 'country' => 'SA', 'category' => 'programs',
            'name_ar' => 'إذاعة نداء الإسلام من مكة المكرمة', 'name_en' => 'Nidaa al-Islam Radio — Makkah',
            'streams' => [
                'https://stream.radiojar.com/4wqre23fytzuv',       // [memory] Radiojar mount — check that it really is Nidaa al-Islam
            ],
        ],
        // ── United Arab Emirates ───────────────────────────────────────────────
        [
            'id' => 'ae-sharjah-quran', 'country' => 'AE', 'category' => 'quran', 'featured' => true,
            'name_ar' => 'إذاعة القرآن الكريم من الشارقة', 'name_en' => 'Sharjah Holy Quran Radio',
            'streams' => [
                'https://l3.itworkscdn.net/smcquranlive/quranradiolive/icecast.audio', // [brief] Sharjah Broadcasting Authority
                'https://l3.itworkscdn.net/smcquranlive/quranradiolive/playlist.m3u8', // [guess] HLS of the same channel
            ],
        ],
        [
            'id' => 'ae-abudhabi-quran', 'country' => 'AE', 'category' => 'quran', 'featured' => true,
            'name_ar' => 'إذاعة القرآن الكريم من أبوظبي', 'name_en' => 'Abu Dhabi Holy Quran Radio',
            'streams' => [
                'https://admdn2.cdn.mangomolo.com/quranradio/smil:quranradio.stream.smil/playlist.m3u8', // [guess] ADMN on Mangomolo
                'https://admdn5.cdn.mangomolo.com/quranradio/smil:quranradio.stream.smil/playlist.m3u8', // [guess]
            ],
        ],
        [
            'id' => 'ae-noor-dubai', 'country' => 'AE', 'category' => 'quran', 'featured' => true,
            'name_ar' => 'إذاعة نور دبي', 'name_en' => 'Noor Dubai Radio',
            'streams' => [
                'https://dmisxthvll.cdn.mangomolo.com/noordubaifm/smil:noordubaifm.stream.smil/playlist.m3u8', // [guess] Dubai Media on Mangomolo
                'https://dmiffthvll.cdn.mangomolo.com/noordubaifm/smil:noordubaifm.stream.smil/playlist.m3u8', // [guess]
            ],
        ],
        // ── Kuwait ──────────────────────────────────────────────────────────────
        [
            'id' => 'kw-quran', 'country' => 'KW', 'category' => 'quran', 'featured' => true,
            'name_ar' => 'إذاعة القرآن الكريم من الكويت', 'name_en' => 'Kuwait Holy Quran Radio',
            'streams' => [
                'https://radio.mp3islam.com/listen/quran_radio/radio.mp3', // [radio-browser 2026-11, verified by server check]
                'https://kwtquranfm.cdn.mangomolo.com/quranfm/smil:quranfm.stream.smil/playlist.m3u8', // [guess] Ministry of Information on Mangomolo
                'https://kwtradio.cdn.mangomolo.com/quran/smil:quran.stream.smil/playlist.m3u8',       // [guess]
            ],
        ],
        // ── Jordan ──────────────────────────────────────────────────────────────
        [
            'id' => 'jo-quran', 'country' => 'JO', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم الأردنية', 'name_en' => 'Jordan Holy Quran Radio',
            'streams' => [
                'https://jrtv-live.ercdn.net/jrradio/quranradio.m3u8', // [radio-browser 2026-11, verified by server check]
                'https://jrtv-live.ercdn.net/quranradio/quranradio.m3u8', // [guess] JRTV radio on its CDN
            ],
        ],
        [
            'id' => 'jo-hayat-fm', 'country' => 'JO', 'category' => 'programs',
            'name_ar' => 'حياة إف إم', 'name_en' => 'Hayat FM',
            'streams' => [
                'https://dc1.serverse.com/proxy/kjxwtpdt/stream', // [radio-browser 2026-11, verified by server check]
                // TODO: no stream URL known — copy the one from Hayat FM's own web player (the station stays hidden until then)
            ],
        ],
        // ── Palestine ───────────────────────────────────────────────────────────
        [
            'id' => 'ps-nablus-quran', 'country' => 'PS', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم — نابلس', 'name_en' => 'Holy Quran Radio — Nablus',
            'streams' => [
                'https://quran-radio.org:8443/;',     // [guess] the station's own Shoutcast over TLS
                'http://quran-radio.org:8002/;',      // [memory] http Shoutcast — usable only if it redirects to https
            ],
        ],
        // ── Tunisia ─────────────────────────────────────────────────────────────
        [
            'id' => 'tn-zitouna', 'country' => 'TN', 'category' => 'quran',
            'name_ar' => 'إذاعة الزيتونة للقرآن الكريم', 'name_en' => 'Radio Zitouna — Holy Quran',
            'streams' => [
                'https://radio.radiotunisienne.tn/radiozaitouna', // [radio-browser 2026-11, verified by server check]
                'https://stream.zitounafm.net/zitounafm', // [guess]
                'http://stream6.tanitweb.com/zitounafm',  // [memory] http — only if it redirects to https
            ],
        ],
        // ── Morocco ─────────────────────────────────────────────────────────────
        [
            'id' => 'ma-mohammed6', 'country' => 'MA', 'category' => 'quran',
            'name_ar' => 'إذاعة محمد السادس للقرآن الكريم', 'name_en' => 'Mohammed VI Holy Quran Radio',
            'streams' => [
                'https://cdnamd-hls-globecast.akamaized.net/live/ramdisk/radio_mohammed6/hls_snrt/index.m3u8', // [guess] SNRT's Globecast HLS pattern
            ],
        ],
        // ── Qatar ───────────────────────────────────────────────────────────────
        [
            'id' => 'qa-quran', 'country' => 'QA', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم من الدوحة', 'name_en' => 'Qatar Holy Quran Radio',
            'streams' => [
                'https://qmc-radio.akamaized.net/hls/live/quran/index.m3u8', // [guess] Qatar Media Corporation
            ],
        ],
        // ── Oman ────────────────────────────────────────────────────────────────
        [
            'id' => 'om-quran', 'country' => 'OM', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم من سلطنة عُمان', 'name_en' => 'Oman Holy Quran Radio',
            'streams' => [
                'https://partneta.cdn.mgmlcdn.com/omquran/smil:omquran.stream.smil/playlist.m3u8', // [guess] Oman TV/radio on Mangomolo
            ],
        ],
        // ── Algeria ─────────────────────────────────────────────────────────────
        [
            'id' => 'dz-quran', 'country' => 'DZ', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم الجزائرية', 'name_en' => 'Algerian Holy Quran Radio',
            'streams' => [
                'https://webradio1.tda.dz:8001/Coran_64K.mp3', // [radio-browser 2026-11, verified by server check]
                'https://webradio.tda.dz/Coran_64K.mp3', // [memory] TDA (Télédiffusion d'Algérie) web radio
                'http://webradio.tda.dz/Coran_64K.mp3',  // [memory] http — only if it redirects to https
            ],
        ],
        // ── Libya ───────────────────────────────────────────────────────────────
        [
            'id' => 'ly-quran', 'country' => 'LY', 'category' => 'quran',
            'name_ar' => 'إذاعة المنير للقرآن الكريم — ليبيا', 'name_en' => 'Almunir Quran Radio — Libya',
            'streams' => [
                'https://live.munir.ly/proxy/almunir/stream', // [radio-browser 2026-11, verified by server check]
                'https://live.munir.ly/proxy/almunirtip/stream', // [radio-browser 2026-11, verified by server check]
                // TODO: no stream URL known — add the official stream (the station stays hidden until then)
            ],
        ],
        // ── Sudan ───────────────────────────────────────────────────────────────
        [
            'id' => 'sd-quran', 'country' => 'SD', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم السودانية', 'name_en' => 'Sudan Holy Quran Radio',
            'streams' => [
                // TODO: no stream URL known — add the official stream (the station stays hidden until then)
            ],
        ],
        // ── Bahrain ─────────────────────────────────────────────────────────────
        [
            'id' => 'bh-quran', 'country' => 'BH', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم من البحرين', 'name_en' => 'Bahrain Holy Quran Radio',
            'streams' => [
                'https://5c7b683162943.streamlock.net/live/ngrp:bahrainquran_all/playlist.m3u8', // [guess] same Wowza host as Bahrain TV
            ],
        ],
        // ── mp3quran.net channels that keep the page useful when the mp3quran API is unreachable ──────────────
        // (the same URLs come back from the API; the duplicate is dropped there and this entry is kept)
        // ── Lebanon / Saudi (found in the radio-browser directory, verified by server check) ──
        [
            'id' => 'lb-quran-933', 'country' => 'LB', 'category' => 'quran',
            'name_ar' => 'إذاعة القرآن الكريم ٩٣٫٣ — لبنان', 'name_en' => 'Quran Radio 93.3 FM — Lebanon',
            'streams' => [
                'https://audio.osina.cloud:7987/stream', // [radio-browser 2026-11]
            ],
        ],
        [
            'id' => 'lb-ayat-quran', 'country' => 'LB', 'category' => 'quran',
            'name_ar' => 'إذاعة آيات القرآن', 'name_en' => 'Ayat Al Quran Radio',
            'streams' => [
                'https://stream.zeno.fm/1fatuk10fkhvv', // [radio-browser 2026-11]
            ],
        ],
        [
            'id' => 'sa-tarteel', 'country' => 'SA', 'category' => 'recitation',
            'name_ar' => 'إذاعة ترتيل — ترتيل القرآن الكريم', 'name_en' => 'Tarteel Radio — Quran recitation',
            'streams' => [
                'https://live.trtel.vip/live', // [radio-browser 2026-11]
            ],
        ],
        [
            'id' => 'mp3q-mix', 'country' => '', 'category' => 'recitation',
            'name_ar' => 'إذاعة تلاوات متنوعة لنخبة من القرّاء', 'name_en' => 'Mixed recitations by renowned reciters',
            'streams' => [
                'https://backup.qurango.net/radio/mix', // [memory] mp3quran.net 24/7 channel
            ],
        ],
        [
            'id' => 'mp3q-tarateel', 'country' => '', 'category' => 'recitation',
            'name_ar' => 'إذاعة تراتيل قصيرة متميزة', 'name_en' => 'Short distinguished recitations',
            'streams' => [
                'https://backup.qurango.net/radio/tarateel', // [memory] mp3quran.net 24/7 channel
            ],
        ],
    ];
}
