// Mounts the full-screen adhan moment in its own React root (outside the router).
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import AdhanMoment from './AdhanMoment';
import { playAdhan, stopAdhan } from './player';

let root = null;
let host = null;
let current = null;

export function closeAdhanMoment() {
  stopAdhan();
  current = null;
  if (root) root.render(null);
}

/**
 * opts: { id, prayer, time, city, recording, play, offset, onSnooze, onStop }
 */
export function showAdhanMoment(opts) {
  if (!host) {
    host = document.createElement('div');
    host.id = 'nq-adhan-moment';
    document.body.appendChild(host);
    root = createRoot(host);
  }
  current = opts;
  if (opts.play) playAdhan(opts.recording, opts.offset || 0);
  const close = () => { if (current === opts) closeAdhanMoment(); };
  root.render(createElement(AdhanMoment, {
    ...opts,
    key: `${opts.id}-${Date.now()}`,
    onStop: () => { stopAdhan(); opts.onStop && opts.onStop(); close(); },
    onSnooze: () => { stopAdhan(); opts.onStop && opts.onStop(); opts.onSnooze && opts.onSnooze(); close(); },
    onClose: () => { stopAdhan(); opts.onStop && opts.onStop(); close(); },
  }));
}
