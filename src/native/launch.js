// ─── App opening screen ──────────────────────────────────────────────────────
// index.html paints a branded screen (#nq-launch) from the very first frame inside the
// app. The native splash hides onto it at once (Android 12+ only shows the icon on a flat
// colour, so this is the screen people actually see), and it fades away once the first
// app screen has painted and the opening animation has had time to play.
const MIN_MS = 3000;          // star draws, mark lands with its rays, the name reveals and shines (~2.9 s)
const MIN_MS_REDUCED = 700;

export const launchVisible = () => document.documentElement.classList.contains('nq-launching');

export function finishLaunch() {
  const root = document.documentElement;
  if (!launchVisible()) return Promise.resolve();
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = Math.max(0, (reduced ? MIN_MS_REDUCED : MIN_MS) - performance.now());
  return new Promise((resolve) => {
    setTimeout(() => {
      root.classList.add('nq-launch-out');
      setTimeout(() => {
        root.classList.remove('nq-launching', 'nq-launch-out');
        document.getElementById('nq-launch')?.remove();
        resolve();
      }, reduced ? 150 : 720);
    }, wait);
  });
}
