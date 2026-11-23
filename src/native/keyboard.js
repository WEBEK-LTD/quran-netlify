// ─── On-screen keyboard (app only) ──────────────────────────────────────────
// While the keyboard is up: html.nq-kb hides the tab bar (src/styles/native.css)
// and the focused field is scrolled into the visible part of the screen, so a
// form's input is never hidden behind the keyboard.
import { Keyboard } from '@capacitor/keyboard';

export async function initKeyboard() {
  const root = document.documentElement;
  const show = (info) => {
    root.classList.add('nq-kb');
    const h = info && info.keyboardHeight;
    if (h) root.style.setProperty('--nq-kb-h', `${h}px`);
  };
  const hide = () => { root.classList.remove('nq-kb'); root.style.removeProperty('--nq-kb-h'); };
  const reveal = () => {
    const el = document.activeElement;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { el.scrollIntoView(); }
  };
  await Keyboard.addListener('keyboardWillShow', show);
  await Keyboard.addListener('keyboardDidShow', (info) => { show(info); reveal(); });
  await Keyboard.addListener('keyboardWillHide', hide);
  await Keyboard.addListener('keyboardDidHide', hide);
  // a field focused while the keyboard is already open (next field) also comes into view
  document.addEventListener('focusin', () => { if (root.classList.contains('nq-kb')) setTimeout(reveal, 60); });
}
