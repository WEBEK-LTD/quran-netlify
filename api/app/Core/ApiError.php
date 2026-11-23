<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * An error that is safe to show to the user. Rendered as
 * {"ok":false,"error":{"code":…,"message":…, ...extra}}.
 */
final class ApiError extends \RuntimeException
{
    private const MESSAGES = [
        'unauthenticated'     => 'يجب تسجيل الدخول أولاً.',
        'forbidden'           => 'ليس لديك صلاحية للقيام بهذا الإجراء.',
        'not_found'           => 'العنصر المطلوب غير موجود.',
        'validation'          => 'بعض البيانات المدخلة غير صحيحة.',
        'rate_limited'        => 'عدد كبير من المحاولات. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
        'maintenance'         => 'الموقع في وضع الصيانة حالياً. يرجى المحاولة لاحقاً.',
        'banned'              => 'تم إيقاف هذا الحساب.',
        'server'              => 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.',
        'bad_request'         => 'الطلب غير صالح.',
        'payload_too_large'   => 'حجم البيانات المرسلة كبير جداً.',
        'method_not_allowed'  => 'طريقة الطلب غير مسموحة.',
        'feature_disabled'    => 'هذه الميزة غير مفعّلة حالياً.',
        'csrf'                => 'الطلب مرفوض لأسباب أمنية.',
        'invalid_credentials' => 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
        'email_taken'         => 'هذا البريد الإلكتروني مسجّل مسبقاً.',
        'signup_closed'       => 'التسجيل مغلق حالياً.',
        'invalid_token'       => 'الرابط غير صالح أو منتهي الصلاحية.',
        'ticket_closed'       => 'هذه التذكرة مغلقة.',
        'ai_not_configured'   => 'المساعد الذكي غير مُعدّ بعد.',
        'ai_error'            => 'تعذّر الحصول على رد من المساعد الآن. يرجى المحاولة لاحقاً.',
        'limit_reached'       => 'وصلت إلى الحد الأقصى المسموح.',
        'conflict'            => 'تعارض في البيانات.',
    ];

    /** @param array<string,mixed> $extra @param array<string,string> $headers */
    public function __construct(
        public readonly int $status,
        public readonly string $errCode,
        ?string $message = null,
        public readonly array $extra = [],
        public readonly array $headers = []
    ) {
        parent::__construct($message ?? (self::MESSAGES[$errCode] ?? self::MESSAGES['server']));
    }

    public static function of(int $status, string $code, ?string $message = null): self
    {
        return new self($status, $code, $message);
    }

    public static function unauthenticated(): self { return new self(401, 'unauthenticated'); }
    public static function forbidden(?string $msg = null): self { return new self(403, 'forbidden', $msg); }
    public static function notFound(?string $msg = null): self { return new self(404, 'not_found', $msg); }
    public static function badRequest(?string $msg = null): self { return new self(400, 'bad_request', $msg); }

    /** @param array<string,string> $fields */
    public static function validation(array $fields, ?string $msg = null): self
    {
        return new self(422, 'validation', $msg, ['fields' => $fields]);
    }

    public static function rateLimited(int $retryAfter): self
    {
        $retryAfter = max(1, $retryAfter);
        return new self(429, 'rate_limited', null, ['retry_after' => $retryAfter], ['Retry-After' => (string) $retryAfter]);
    }
}
