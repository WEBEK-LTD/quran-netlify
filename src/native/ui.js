// ─── Minimal native-only dialog (plain DOM, site tokens) ────────────────────
// Used for permission explanations before the OS prompt, so it works from any
// module without a React tree.
export function confirmDialog({ title, body, confirm, cancel }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.55)';
    const card = document.createElement('div');
    card.style.cssText = 'max-width:420px;width:100%;background:var(--surface,#0E1A15);color:var(--text,#F1EEE3);border:1px solid var(--line2,rgba(201,168,76,.35));border-radius:18px;padding:22px 20px;box-shadow:0 20px 60px rgba(0,0,0,.45);font:inherit;text-align:start';
    const h = document.createElement('h2');
    h.textContent = title || '';
    h.style.cssText = 'margin:0 0 10px;font-size:1.15rem;color:var(--gold,#C9A84C)';
    const p = document.createElement('p');
    p.textContent = body || '';
    p.style.cssText = 'margin:0 0 18px;line-height:1.8;font-size:.98rem';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end';
    const mk = (label, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `nq-btn ${primary ? 'gold' : 'ghost'}`;
      b.textContent = label;
      return b;
    };
    const no = mk(cancel || 'إلغاء', false);
    const yes = mk(confirm || 'موافق', true);
    const done = (v) => { wrap.remove(); window.removeEventListener('nq-native-back', onBack); resolve(v); };
    const onBack = (e) => { e.preventDefault(); done(false); };
    no.onclick = () => done(false);
    yes.onclick = () => done(true);
    window.addEventListener('nq-native-back', onBack);
    row.append(no, yes);
    card.append(h, p, row);
    wrap.append(card);
    document.body.append(wrap);
    setTimeout(() => yes.focus(), 30);
  });
}
