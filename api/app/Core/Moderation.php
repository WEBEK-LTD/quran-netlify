<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * The admin dictionary («القاموس»): words with level `severe` («شديدة») or `possible` («محتملة»), matched against room
 * chat, DMs, room titles, group names/descriptions and bios — with evasion handling:
 *   - diacritics, tatweel, invisible/bidi characters and Quranic marks are removed; alef/yaa/taa-marbuta/hamza
 *     variants are folded (أإآٱ→ا, ى/ئ→ي, ؤ→و, ة→ه), Persian/Urdu look-alikes folded (ک→ك, ی→ي);
 *   - repeated letters collapse («كلللب» → «كلب»), on both the text and the word;
 *   - punctuation/symbols inside a word are dropped («ك.ل.ب», «ك_ل_ب»), runs of single letters separated by spaces are
 *     joined («ك ل ب»), and for words of ≥ 4 letters the whole text is also checked with every separator removed;
 *   - Arabizi/Franco: latin+digit tokens are transliterated (2→ء 3→ع 5→خ 6→ط 7→ح 8→ق 9→ص, 3'→غ, sh→ش, kh→خ, gh→غ,
 *     th→ث, dh→ذ…) and compared by consonant skeleton (vowel letters ا و ي ء and a final ه removed): «7mar» ~ «حمار»;
 *   - latin words are matched after leetspeak folding (0→o 1→i 3→e 4→a 5→s @→a $→s).
 * Matching is substring within a word for words of ≥ 3 letters (Arabic prefixes/suffixes), exact for shorter ones.
 * Words that also appear in the Quran must be `possible` (see AdminCommunityController::dictionaryCreate).
 */
final class Moderation
{
    public const CONTEXTS = ['room_chat', 'dm', 'room_title', 'group_name', 'group_description', 'bio'];

    /** @var list<array{id:int, word:string, level:string, ar:string, skel:string, latin:string}>|null */
    private static ?array $words = null;

    public static function flush(): void
    {
        self::$words = null;
    }

    /** Remove marks and fold letter variants (keeps letters, digits, spaces and punctuation). */
    public static function fold(string $s): string
    {
        $s = mb_strtolower($s);
        $s = (string) preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2069}\x{FEFF}\x{00AD}\x{061C}\x{180E}]/u', '', $s);
        $s = (string) preg_replace('/[\x{0610}-\x{061A}\x{064B}-\x{065F}\x{0670}\x{06D6}-\x{06ED}\x{08D3}-\x{08FF}\x{0640}]/u', '', $s);
        $s = strtr($s, [
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ٲ' => 'ا', 'ٳ' => 'ا',
            'ى' => 'ي', 'ئ' => 'ي', 'ی' => 'ي', 'ې' => 'ي', 'ؤ' => 'و', 'ة' => 'ه', 'ۀ' => 'ه', 'ہ' => 'ه', 'ھ' => 'ه',
            'ک' => 'ك', 'گ' => 'ك', 'ڤ' => 'ف', 'پ' => 'ب', 'چ' => 'ج', 'ژ' => 'ز',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        ]);
        return $s;
    }

    public static function collapse(string $s): string
    {
        return (string) preg_replace('/(.)\1+/u', '$1', $s);
    }

    /** Keep letters and digits only (plus the Franco apostrophe and leet symbols, handled by the callers). */
    private static function lettersOnly(string $s, bool $keepFranco = false): string
    {
        return (string) preg_replace($keepFranco ? "/[^\\p{L}\\p{N}'@$]/u" : '/[^\p{L}\p{N}]/u', '', $s);
    }

    /** Arabizi/Franco → Arabic letters. */
    public static function arabizi(string $t): string
    {
        $t = strtolower($t);
        $t = strtr($t, [
            "3'" => 'غ', "7'" => 'خ', "9'" => 'ض', "6'" => 'ظ',
            'sh' => 'ش', 'ch' => 'ش', 'kh' => 'خ', 'gh' => 'غ', 'th' => 'ث', 'dh' => 'ذ', 'ou' => 'و', 'ee' => 'ي', 'oo' => 'و',
        ]);
        return strtr($t, [
            '2' => 'ء', '3' => 'ع', '5' => 'خ', '6' => 'ط', '7' => 'ح', '8' => 'ق', '9' => 'ص', "'" => '',
            'a' => 'ا', 'b' => 'ب', 'c' => 'ك', 'd' => 'د', 'e' => 'ي', 'f' => 'ف', 'g' => 'ج', 'h' => 'ه', 'i' => 'ي',
            'j' => 'ج', 'k' => 'ك', 'l' => 'ل', 'm' => 'م', 'n' => 'ن', 'o' => 'و', 'p' => 'ب', 'q' => 'ق', 'r' => 'ر',
            's' => 'س', 't' => 'ت', 'u' => 'و', 'v' => 'ف', 'w' => 'و', 'x' => 'كس', 'y' => 'ي', 'z' => 'ز',
        ]);
    }

    /** Consonant skeleton: vowel letters and hamza removed, final ه dropped, repeats collapsed. */
    public static function skeleton(string $ar): string
    {
        $s = (string) preg_replace('/[اويء]/u', '', $ar);
        $s = self::collapse($s);
        return mb_strlen($s) > 2 ? (string) preg_replace('/ه$/u', '', $s) : $s;
    }

    public static function leet(string $t): string
    {
        return self::collapse(strtr(strtolower($t), ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's', '!' => 'i']));
    }

    /** @return array{ar:string, skel:string, latin:string} the comparable forms of a dictionary word */
    public static function wordForms(string $word): array
    {
        $f = self::fold($word);
        $isLatin = preg_match('/\p{Arabic}/u', $f) !== 1 && preg_match('/[a-z]/', $f) === 1;
        $ar = self::collapse(self::lettersOnly($f));
        return [
            'ar' => $isLatin ? '' : $ar,
            'skel' => $isLatin ? '' : self::skeleton($ar),
            'latin' => $isLatin ? self::leet(self::lettersOnly($f, true)) : '',
        ];
    }

    /**
     * The comparable forms of a text.
     * @return array{tokens:list<string>, joined:string, latin_joined:string, franco:list<string>, latin:list<string>}
     */
    public static function textForms(string $text): array
    {
        $f = self::fold($text);
        $raw = preg_split('/[\s\x{00A0}\x{2000}-\x{200A}\x{3000}]+/u', $f, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $tokens = [];
        $franco = [];
        $latin = [];
        $run = '';
        $flush = static function () use (&$run, &$tokens): void {
            if ($run !== '') {
                $tokens[] = self::collapse($run);
                $run = '';
            }
        };
        foreach ($raw as $tok) {
            $letters = self::lettersOnly($tok);
            if ($letters === '') {
                continue;
            }
            if (preg_match('/[a-z]/', $tok) === 1) {
                $fr = (string) preg_replace("/[^a-z0-9']/", '', $tok);
                $franco[] = self::skeleton(self::collapse(self::arabizi($fr)));
                $latin[] = self::leet((string) preg_replace('/[^a-z0-9@$!]/', '', $tok));
            }
            // runs of single letters separated by spaces («ك ل ب») are one word
            if (mb_strlen($letters) === 1) {
                $run .= $letters;
                continue;
            }
            $flush();
            $tokens[] = self::collapse($letters);
        }
        $flush();
        foreach ($tokens as $tok) { // joined single letters («i d i o t») and dotted words count for latin words too
            if (preg_match('/[a-z]/', $tok) === 1) {
                $latin[] = self::leet($tok);
            }
        }
        $joined = self::collapse(self::lettersOnly($f));
        return [
            'tokens' => $tokens,
            'joined' => $joined,
            'latin_joined' => preg_match('/[a-z]/', $joined) === 1 ? self::leet($joined) : '',
            'franco' => array_values(array_filter($franco, static fn (string $s): bool => $s !== '')),
            'latin' => $latin,
        ];
    }

    /** @return list<array{id:int, word:string, level:string, ar:string, skel:string, latin:string}> */
    private static function words(): array
    {
        if (self::$words !== null) {
            return self::$words;
        }
        $out = [];
        foreach (Db::all("SELECT id, word, level FROM dictionary_words ORDER BY level = 'severe' DESC, id") as $w) {
            $forms = self::wordForms((string) $w['word']);
            if ($forms['ar'] === '' && $forms['latin'] === '') {
                continue;
            }
            $out[] = ['id' => (int) $w['id'], 'word' => (string) $w['word'], 'level' => (string) $w['level']] + $forms;
        }
        return self::$words = $out;
    }

    /**
     * 'strong' = the word itself (or an evasion of it) is in a word of the text; 'weak' = only found once every space
     * is removed (could straddle two innocent words), which never suspends: a severe word found only that way is
     * treated as «possible» (held for review).
     * @param array{ar:string, skel:string, latin:string} $w @param array<string,mixed> $t
     */
    public static function matches(array $w, array $t): ?string
    {
        if ($w['ar'] !== '') {
            $len = mb_strlen($w['ar']);
            foreach ($t['tokens'] as $tok) {
                if ($tok === $w['ar'] || ($len >= 3 && mb_strpos($tok, $w['ar']) !== false)) {
                    return 'strong';
                }
            }
            $sk = $w['skel'];
            if (mb_strlen($sk) >= 3) {
                foreach ($t['franco'] as $fr) {
                    if ($fr === $sk || $fr === 'ل' . $sk || (mb_strlen($sk) >= 4 && mb_strpos($fr, $sk) !== false)) {
                        return 'strong';
                    }
                }
            }
            if ($len >= 4 && mb_strpos($t['joined'], $w['ar']) !== false) {
                return 'weak';
            }
        }
        if ($w['latin'] !== '') {
            $len = strlen($w['latin']);
            foreach ($t['latin'] as $tok) {
                if ($tok === $w['latin'] || ($len >= 4 && str_contains($tok, $w['latin']))) {
                    return 'strong';
                }
            }
            if ($len >= 5 && $t['latin_joined'] !== '' && str_contains($t['latin_joined'], $w['latin'])) {
                return 'weak';
            }
        }
        return null;
    }

    /** First match, severe words first. @return array{id:int, word:string, level:string}|null */
    public static function scan(string $text): ?array
    {
        if (trim($text) === '') {
            return null;
        }
        $words = self::words();
        if ($words === []) {
            return null;
        }
        $t = self::textForms($text);
        $weak = null;
        foreach ($words as $w) {
            $m = self::matches($w, $t);
            if ($m === 'strong') {
                return ['id' => $w['id'], 'word' => $w['word'], 'level' => $w['level']];
            }
            if ($m === 'weak' && $weak === null) {
                $weak = ['id' => $w['id'], 'word' => $w['word'], 'level' => 'possible'];
            }
        }
        return $weak;
    }

    /**
     * Check user-written text before it is stored or delivered. On a match the text is kept as evidence
     * (held_content) with a report for the admins, and:
     *   severe   → the account is suspended from the community until an admin decides; throws 403 community_suspended;
     *   possible → nothing is delivered; throws 422 content_review.
     * $onSevere runs before the exception (e.g. remove the user from the LiveKit room).
     * Must be called outside a transaction so the evidence survives the error.
     */
    public static function enforce(int $userId, string $context, ?int $contextId, string $text, ?callable $onSevere = null): void
    {
        $hit = self::scan($text);
        if ($hit === null) {
            return;
        }
        $heldId = Db::insert(
            'INSERT INTO held_content (user_id, context, context_id, body, level, matched, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$userId, $context, $contextId, mb_substr($text, 0, 5000), $hit['level'], mb_substr($hit['word'], 0, 100), Db::now()]
        );
        $reportId = Db::insert(
            "INSERT INTO reports (reporter_id, source, level, target_type, target_id, target_user_id, reason, details, snapshot, status, created_at)
             VALUES (NULL, 'dictionary', ?, 'held', ?, ?, 'dictionary', ?, ?, 'open', ?)",
            [$hit['level'], $heldId, $userId, $context, (string) json_encode(['context' => $context, 'context_id' => $contextId, 'body' => mb_substr($text, 0, 2000), 'matched' => $hit['word']], JSON_UNESCAPED_UNICODE), Db::now()]
        );
        if ($hit['level'] === 'severe') {
            Db::exec(
                "INSERT INTO community_bans (user_id, scope, source, reason, until, locked, report_id, created_by, created_at)
                 VALUES (?, 'community', 'dictionary', ?, NULL, 0, ?, NULL, ?)
                 ON DUPLICATE KEY UPDATE scope = 'community', source = IF(locked = 1, source, 'dictionary'), reason = VALUES(reason),
                   until = IF(locked = 1, until, NULL), report_id = VALUES(report_id), created_at = VALUES(created_at)",
                [$userId, 'تم إيقاف حسابك في المجتمع تلقائياً بسبب كلمة محظورة، حتى تراجعه الإدارة.', $reportId, Db::now()]
            );
            Community::forgetSuspension($userId);
            if ($onSevere !== null) {
                try {
                    $onSevere();
                } catch (\Throwable $e) {
                    App::logThrowable($e);
                }
            }
            Push::notify($userId, 'suspension', 'تم إيقاف حسابك في المجتمع', 'استخدمت كلمة محظورة. سيراجع فريق الإدارة الأمر.', ['reason' => 'dictionary']);
            throw new ApiError(403, 'community_suspended', 'لم تُرسل رسالتك لأنها تحتوي على كلمة محظورة، وتم إيقاف حسابك في المجتمع حتى تراجعه الإدارة.');
        }
        throw new ApiError(422, 'content_review', 'لم يُرسل المحتوى لأنه قد يحتوي على كلمة غير لائقة، وأُرسل للإدارة للمراجعة.');
    }

    /** Links, e-mail addresses and handles are not allowed in community text (text only: no links). */
    public static function hasLink(string $text): bool
    {
        $t = self::fold($text);
        return preg_match('~(https?:|ftp:|www\.|[a-z0-9-]+\s?(\.|dot|\(dot\)|\[dot\])\s?(com|net|org|io|me|co|ly|gl|app|info|xyz|tk|ru|link|site|online|store|tv|gg|biz|us|uk|de|fr|sa|ae|eg|tr|be|to|cc)\b|t\.me/|wa\.me/|bit\.ly|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})~iu', $t) === 1;
    }
}
