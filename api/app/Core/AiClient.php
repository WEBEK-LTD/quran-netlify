<?php
declare(strict_types=1);

namespace NQ\Core;

/** Calls the configured AI provider (Anthropic or OpenAI). Never leaks keys or upstream bodies. */
final class AiClient
{
    public const DEFAULT_MODELS = [
        'anthropic' => 'claude-sonnet-5-5',
        'openai' => 'gpt-4o-mini',
    ];

    /** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
    private const FALLBACK_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1'];

    /** @return array{provider:string,key:string,model:string}|null */
    public static function config(): ?array
    {
        $provider = Integrations::get('ai_provider');
        if ($provider === '') {
            $provider = Integrations::get('anthropic_api_key') !== '' ? 'anthropic'
                : (Integrations::get('openai_api_key') !== '' ? 'openai' : '');
        }
        if (!isset(self::DEFAULT_MODELS[$provider])) {
            return null;
        }
        $key = Integrations::get($provider === 'anthropic' ? 'anthropic_api_key' : 'openai_api_key');
        if ($key === '') {
            return null;
        }
        $model = Integrations::get('ai_model') ?: self::DEFAULT_MODELS[$provider];
        return ['provider' => $provider, 'key' => $key, 'model' => $model];
    }

    /**
     * @param array{provider:string,key:string,model:string} $cfg
     * @param list<array{role:string,content:string}> $messages
     */
    public static function complete(array $cfg, string $system, array $messages, int $maxTokens = 1024): string
    {
        return $cfg['provider'] === 'anthropic'
            ? self::anthropic($cfg, $system, $messages, $maxTokens)
            : self::openai($cfg, $system, $messages, $maxTokens);
    }

    private static function anthropic(array $cfg, string $system, array $messages, int $maxTokens): string
    {
        $model = $cfg['model'];
        $body = ['model' => $model, 'max_tokens' => $maxTokens, 'system' => $system, 'messages' => $messages];
        $headers = ['x-api-key' => $cfg['key'], 'anthropic-version' => '2023-06-01'];
        $extras = [];
        $extraHeaders = [];
        // Current Claude models think adaptively by default; low effort keeps chat replies fast and within max_tokens.
        if (preg_match('/^claude-(opus|sonnet|fable|mythos)-(5|4-[6-9])|^claude-haiku-5-5/', $model)) {
            $extras['output_config'] = ['effort' => 'low'];
        }
        if (in_array($model, self::FALLBACK_MODELS, true)) {
            // If a safety classifier declines, the API re-runs the request on a suitable fallback model.
            $extras['fallbacks'] = 'default';
            $extraHeaders['anthropic-beta'] = 'server-side-fallback-2026-07-01';
        }
        $res = Http::postJson('https://api.anthropic.com/v1/messages', $body + $extras, $headers + $extraHeaders, 45);
        if ($res['status'] === 400 && ($extras !== [] || $extraHeaders !== [])) {
            // A custom ai_model may not support the optional parameters: retry with the plain request.
            $res = Http::postJson('https://api.anthropic.com/v1/messages', $body, $headers, 45);
        }
        if ($res['status'] !== 200 || !is_array($res['json'])) {
            self::logUpstream('anthropic', $res);
            throw self::friendly($res['status']);
        }
        $text = '';
        foreach ((array) ($res['json']['content'] ?? []) as $block) {
            if (is_array($block) && ($block['type'] ?? '') === 'text') {
                $text .= (string) ($block['text'] ?? '');
            }
        }
        $text = trim($text);
        if ($text === '') {
            if (($res['json']['stop_reason'] ?? '') === 'refusal') {
                return 'عذراً، لا أستطيع المساعدة في هذا السؤال. يمكنك سؤال أهل العلم الموثوقين. والله أعلم.';
            }
            throw self::friendly(502);
        }
        return $text;
    }

    private static function openai(array $cfg, string $system, array $messages, int $maxTokens): string
    {
        $body = [
            'model' => $cfg['model'],
            'max_tokens' => $maxTokens,
            'messages' => array_merge([['role' => 'system', 'content' => $system]], $messages),
        ];
        $res = Http::postJson('https://api.openai.com/v1/chat/completions', $body, ['Authorization' => 'Bearer ' . $cfg['key']], 45);
        if ($res['status'] !== 200 || !is_array($res['json'])) {
            self::logUpstream('openai', $res);
            throw self::friendly($res['status']);
        }
        $text = trim((string) ($res['json']['choices'][0]['message']['content'] ?? ''));
        if ($text === '') {
            throw self::friendly(502);
        }
        return $text;
    }

    private static function friendly(int $status): ApiError
    {
        $msg = match (true) {
            $status === 401 || $status === 403 => 'المساعد الذكي غير متاح حالياً بسبب خطأ في الإعدادات. يرجى إبلاغ إدارة الموقع.',
            $status === 429 => 'المساعد مشغول حالياً بسبب كثرة الطلبات. يرجى المحاولة بعد قليل.',
            $status === 0 => 'تعذّر الاتصال بخدمة المساعد الذكي. يرجى المحاولة لاحقاً.',
            default => 'تعذّر الحصول على رد من المساعد الآن. يرجى المحاولة لاحقاً.',
        };
        return new ApiError(502, 'ai_error', $msg);
    }

    /** Log status and the upstream error type only — never the key or full body. */
    private static function logUpstream(string $provider, array $res): void
    {
        $type = '';
        if (is_array($res['json'])) {
            $err = $res['json']['error'] ?? null;
            $type = is_array($err) ? (string) ($err['type'] ?? $err['code'] ?? '') : '';
        }
        error_log(sprintf('[nq] ai upstream %s failed: http=%d type=%s curl=%s', $provider, $res['status'], substr($type, 0, 60), substr($res['error'], 0, 120)));
    }
}
