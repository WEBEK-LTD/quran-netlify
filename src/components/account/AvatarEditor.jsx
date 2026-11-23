// ─── Profile photo editor ────────────────────────────────────────────────────
// Shows the account photo (or the first letter in a gilded circle) with
// «تغيير الصورة» / «إزالة الصورة». Choosing a file opens a square crop dialog
// (drag / pinch / arrow keys to position, slider / wheel / +− to zoom, live
// circular preview). The crop is exported client-side as a 512×512 WebP (JPEG
// fallback) so large phone photos upload fast; the server re-encodes it again.
//
//   import AvatarEditor from '../components/account/AvatarEditor';
//   <AvatarEditor />            // uses the signed-in user (useAuth)
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth, displayNameOf, avatarOf } from '../../hooks/useAuth';
import { uploadAvatar, removeAvatar, ApiError } from '../../backend';
import { apiErrorText } from '../../authErrors';
import { useTr, num } from '../../l10n';
import { Icon } from '../ornaments/Ornaments';
import styles from './AvatarEditor.module.css';

const OUT = 512;                       // exported side (px)
const MIN_SIDE = 64;                   // server minimum
const MAX_FILE = 40 * 1024 * 1024;     // refuse absurd files before decoding
const MAX_ZOOM = 4;
const STAGE_PX = 640;                  // stage canvas resolution (CSS scales it)

// Our wording for the photo-specific API codes (source strings: Arabic).
const CODE_TEXT = {
  unsupported_image:  'نوع الصورة غير مدعوم. اختر صورة JPEG أو PNG أو WebP.',
  image_dimensions:   'أبعاد الصورة غير مناسبة. اختر صورة لا تقل عن {n} بكسل.',
  avatar_too_large:   'حجم الصورة كبير جداً. اختر صورة أصغر.',
  avatar_unavailable: 'رفع الصور غير متاح على الخادم حالياً',
  rate_limited:       'غيّرت صورتك مرات كثيرة خلال وقت قصير — حاول بعد قليل',
};

function errorText(err, tr) {
  if (err instanceof ApiError && CODE_TEXT[err.code]) return tr(CODE_TEXT[err.code], { n: num('64×64') });
  return apiErrorText(err, tr('تعذّر حفظ الصورة، حاول مرة أخرى'));
}

const isUploaded = url => typeof url === 'string' && /\/v1\/avatars\/[^/]+$/.test(url);

// Decode a File into something drawable, honouring EXIF rotation. Rejects when
// the browser can't read the format (e.g. HEIC outside Safari).
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height, release: () => { try { bmp.close(); } catch {} } };
    } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await (img.decode ? img.decode() : new Promise((ok, no) => { img.onload = ok; img.onerror = no; }));
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty');
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

// Crop state: centre (cx, cy) in image pixels + zoom (1 = the short side fills the square).
function clampCrop(c, img) {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom));
  const half = Math.min(img.w, img.h) / zoom / 2;
  return {
    zoom,
    cx: Math.min(img.w - half, Math.max(half, c.cx)),
    cy: Math.min(img.h - half, Math.max(half, c.cy)),
  };
}

function drawCrop(canvas, img, crop, size, background) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const side = Math.min(img.w, img.h) / crop.zoom;
  ctx.clearRect(0, 0, size, size);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, size, size); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img.src, crop.cx - side / 2, crop.cy - side / 2, side, side, 0, 0, size, size);
}

function toBlob(canvas, type, quality) {
  return new Promise(resolve => {
    try { canvas.toBlob(b => resolve(b), type, quality); } catch { resolve(null); }
  });
}

// 512×512 WebP when the browser can encode it, else JPEG on white.
async function exportCrop(img, crop) {
  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  drawCrop(canvas, img, crop, OUT);
  let blob = await toBlob(canvas, 'image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') {
    drawCrop(canvas, img, crop, OUT, '#ffffff');
    blob = await toBlob(canvas, 'image/jpeg', 0.88);
  }
  if (!blob) throw new Error('encode');
  return blob;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ─── crop dialog ─────────────────────────────────────────────────────────────
function CropDialog({ img, onCancel, onSave, busy, error }) {
  const tr = useTr();
  const titleId = useId();
  const hintId = useId();
  const zoomId = useId();
  const boxRef = useRef(null);
  const stageRef = useRef(null);
  const previewRef = useRef(null);
  const [crop, setCrop] = useState(() => clampCrop({ zoom: 1, cx: img.w / 2, cy: img.h / 2 }, img));
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  const update = useCallback(fn => setCrop(c => clampCrop(typeof fn === 'function' ? fn(c) : fn, img)), [img]);

  // draw stage + preview
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (stageRef.current) drawCrop(stageRef.current, img, crop, STAGE_PX);
      if (previewRef.current) drawCrop(previewRef.current, img, crop, 144);
    });
    return () => cancelAnimationFrame(raf);
  }, [img, crop]);

  // focus: into the dialog on open, back to the opener on close; Tab stays inside; Escape cancels
  useEffect(() => {
    const prev = document.activeElement;
    stageRef.current && stageRef.current.focus();
    return () => { if (prev && typeof prev.focus === 'function') prev.focus(); };
  }, []);
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); if (!busy) onCancel(); return; }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const els = [...boxRef.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || !boxRef.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel]);

  // image px per screen px at the current zoom
  const ratio = () => {
    const r = stageRef.current ? stageRef.current.getBoundingClientRect().width : 1;
    return (Math.min(img.w, img.h) / cropRef.current.zoom) / (r || 1);
  };

  const onPointerDown = e => {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = null;
  };
  const onPointerMove = e => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const pts = pointers.current;
    if (pts.size === 1) {
      const k = ratio();
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      update(c => ({ ...c, cx: c.cx - dx * k, cy: c.cy - dy * k }));
    } else if (pts.size === 2) {
      const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
      const dist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (gesture.current) update(c => ({ ...c, zoom: c.zoom * (dist / gesture.current) }));
      gesture.current = dist;
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = e => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  // wheel zoom (non-passive so the page doesn't scroll)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = e => { e.preventDefault(); update(c => ({ ...c, zoom: c.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [update]);

  // Arrows move the photo the way the arrow points (like dragging); Shift = bigger steps; + / − zoom.
  const onStageKey = e => {
    const side = Math.min(img.w, img.h) / crop.zoom;
    const step = side * (e.shiftKey ? 0.1 : 0.025);
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      update(c => ({ ...c, cx: c.cx + dx, cy: c.cy + dy }));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault(); update(c => ({ ...c, zoom: c.zoom * 1.1 }));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault(); update(c => ({ ...c, zoom: c.zoom / 1.1 }));
    } else if (e.key === 'Enter' && !busy) {
      e.preventDefault(); onSave(crop);
    }
  };

  const tooSmall = Math.min(img.w, img.h) < MIN_SIDE;

  return (
    <div className={`nq-overlay ${styles.overlay}`} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="nq-scrim" aria-hidden="true" />
      <div ref={boxRef} className={`nq-card ${styles.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hintId} aria-busy={busy || undefined}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>{tr('ضبط الصورة')}</h2>
          <button type="button" className="nq-ibtn" onClick={onCancel} disabled={busy} aria-label={tr('إغلاق')}><Icon name="x" /></button>
        </div>

        <div className={styles.stageWrap}>
          <div className={styles.stage}>
            <canvas
              ref={stageRef}
              width={STAGE_PX}
              height={STAGE_PX}
              tabIndex={0}
              role="application"
              aria-label={tr('منطقة القص: اسحب الصورة لتحريكها')}
              aria-describedby={hintId}
              className={styles.canvas}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onStageKey}
            />
            <span className={styles.ring} aria-hidden="true" />
          </div>
        </div>
        <p id={hintId} className={styles.hint}>{tr('اسحب الصورة لضبط موضعها، واستخدم الشريط للتكبير. من لوحة المفاتيح: الأسهم للتحريك و + و − للتكبير.')}</p>

        <div className={styles.controls}>
          <div className={styles.zoomRow}>
            <label htmlFor={zoomId} className={styles.zoomLabel}>{tr('تكبير')}</label>
            <span className={styles.zoomIco} aria-hidden="true">−</span>
            <input
              id={zoomId}
              type="range"
              min="1"
              max={MAX_ZOOM}
              step="0.01"
              value={crop.zoom}
              disabled={busy}
              onChange={e => update(c => ({ ...c, zoom: Number(e.target.value) }))}
              aria-valuetext={`${num(Math.round(crop.zoom * 100))}%`}
              className={styles.range}
            />
            <span className={styles.zoomIco} aria-hidden="true">+</span>
          </div>
          <figure className={styles.previewFig}>
            <canvas ref={previewRef} width="144" height="144" className={styles.preview} aria-hidden="true" />
            <figcaption>{tr('معاينة')}</figcaption>
          </figure>
        </div>

        {tooSmall && <p className={styles.error} role="alert">{tr('الصورة صغيرة جداً — اختر صورة لا تقل عن {n} بكسل', { n: num('64×64') })}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.foot}>
          <button type="button" className="nq-btn gold" onClick={() => onSave(crop)} disabled={busy || tooSmall}>
            {busy ? <><span className={styles.spin} aria-hidden="true" />{tr('جارٍ الرفع…')}</> : <><Icon name="check" />{tr('حفظ الصورة')}</>}
          </button>
          <button type="button" className="nq-btn ghost" onClick={onCancel} disabled={busy}>{tr('إلغاء')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── editor ──────────────────────────────────────────────────────────────────
export default function AvatarEditor({ size = 96, className = '' }) {
  const tr = useTr();
  const { user } = useAuth();
  const inputRef = useRef(null);
  const changeRef = useRef(null);
  const inputId = useId();
  const [img, setImg] = useState(null);           // decoded file while the dialog is open
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [broken, setBroken] = useState(false);

  const url = avatarOf(user);
  useEffect(() => { setBroken(false); }, [url]);
  useEffect(() => () => { if (img) img.release(); }, [img]);

  if (!user) return null;

  const initial = (displayNameOf(user, tr.dir === 'rtl' ? '؟' : '?')[0] || '?').toUpperCase();
  const uploaded = isUploaded(url);

  const pick = () => { setError(null); setStatus(''); setConfirmRemove(false); inputRef.current && inputRef.current.click(); };

  const onFile = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                         // choosing the same file again still fires change
    if (!file) return;
    setError(null); setStatus('');
    if (file.type && !file.type.startsWith('image/')) { setError(tr('هذا الملف ليس صورة. اختر صورة JPEG أو PNG أو WebP.')); return; }
    if (file.size > MAX_FILE) { setError(tr('حجم الملف كبير جداً. اختر صورة أصغر.')); return; }
    try {
      const decoded = await decodeImage(file);
      setDialogError(null);
      setImg(decoded);
    } catch {
      setError(tr('تعذّر فتح هذه الصورة في متصفحك. إن كانت بصيغة HEIC فحوّلها إلى JPEG أو PNG ثم حاول مرة أخرى.'));
    }
  };

  const closeDialog = () => { if (busy) return; setImg(null); };

  const save = async crop => {
    if (!img || busy) return;
    setBusy(true); setDialogError(null);
    try {
      const blob = await exportCrop(img, crop);
      await uploadAvatar(blob);
      setImg(null);
      setStatus(tr('تم تحديث صورتك'));
      requestAnimationFrame(() => changeRef.current && changeRef.current.focus());
    } catch (err) {
      setDialogError(err instanceof ApiError ? errorText(err, tr) : tr('تعذّر تجهيز الصورة في متصفحك، جرّب صورة أخرى.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true); setError(null); setStatus('');
    try {
      await removeAvatar();
      setConfirmRemove(false);
      setStatus(tr('أُزيلت الصورة'));
      requestAnimationFrame(() => changeRef.current && changeRef.current.focus());
    } catch (err) {
      setError(errorText(err, tr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${styles.root} ${className}`}>
      <span className={styles.avatar} style={{ '--av': `${size}px` }}>
        {url && !broken
          ? <img src={url} alt={tr('صورتك الشخصية')} onError={() => setBroken(true)} draggable="false" />
          : <span className={styles.initial} aria-hidden="true">{initial}</span>}
        {busy && !img && <span className={styles.avBusy} aria-hidden="true"><span className={styles.spin} /></span>}
      </span>

      <div className={styles.side}>
        <input ref={inputRef} id={inputId} type="file" accept="image/*" className="nq-sr" tabIndex={-1} aria-hidden="true" onChange={onFile} />
        {!confirmRemove ? (
          <div className={styles.actions}>
            <button ref={changeRef} type="button" className="nq-btn ghost sm" onClick={pick} disabled={busy}>
              <CameraIcon />{url ? tr('تغيير الصورة') : tr('إضافة صورة')}
            </button>
            {uploaded && (
              <button type="button" className={`nq-btn ghost sm ${styles.danger}`} onClick={() => { setConfirmRemove(true); setStatus(''); setError(null); }} disabled={busy}>
                <Icon name="x" />{tr('إزالة الصورة')}
              </button>
            )}
          </div>
        ) : (
          <div className={styles.confirm} role="group" aria-label={tr('إزالة الصورة')}>
            <span>{tr('إزالة صورتك الشخصية؟')}</span>
            <div className={styles.actions}>
              <button type="button" className={`nq-btn sm ${styles.dangerSolid}`} onClick={remove} disabled={busy} autoFocus>
                {busy ? tr('جارٍ الإزالة…') : tr('إزالة')}
              </button>
              <button type="button" className="nq-btn ghost sm" onClick={() => setConfirmRemove(false)} disabled={busy}>{tr('إلغاء')}</button>
            </div>
          </div>
        )}
        <p className={styles.note}>{tr('JPEG أو PNG أو WebP، وستُقصّ الصورة على شكل مربع.')}</p>
        <p className={styles.status} role="status" aria-live="polite">{status}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      {img && <CropDialog img={img} onCancel={closeDialog} onSave={save} busy={busy} error={dialogError} />}
    </div>
  );
}

// Camera line icon (same stroke style as the Ornaments sprite).
function CameraIcon() {
  return (
    <svg className="nq-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </svg>
  );
}
