// Unit checks for the selection rule (src/tadhkira/select.js). Run: node src/tadhkira/select.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
// resolve the extension-less './ayat' import used by Vite
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){ if(s==='./ayat') s='./ayat.js'; return n(s,c); }`), import.meta.url);
const { AYAT } = await import('./ayat.js');
const S = await import('./select.js');
const L = AYAT.length;
const addDays = (key, k) => { const [y,m,d] = key.split('-').map(Number); const t = new Date(Date.UTC(y,m-1,d+k)); return t.toISOString().slice(0,10); };

// permutation is a permutation
for (const c of [0, 1, 7]) { const p = S.permutation(L, 'u1', c); assert.equal(new Set(p).size, L); }
// same day, same seed → same ayah (stable)
assert.equal(S.pickRef('user-42', '2026-11-23'), S.pickRef('user-42', '2026-11-23'));
// different seeds differ (at least mostly) on the same day
let diff = 0; for (let i = 0; i < 200; i++) if (S.pickRef('v_' + i, '2026-11-23') !== S.pickRef('v_' + (i + 1000), '2026-11-23')) diff++;
assert.ok(diff > 190, 'different people mostly differ: ' + diff);
// next day differs
for (let i = 0; i < 50; i++) { const s = 'seed' + i; let k = '2026-01-01'; for (let d = 0; d < 3 * L + 5; d++) { const nk = addDays(k, 1); assert.notEqual(S.pickRef(s, k), S.pickRef(s, nk), `${s} ${k}`); k = nk; } }
// no repeats across a full cycle, for several cycles (incl. before the epoch)
for (const seed of ['user-1', 'v_abc', 'guest']) for (const start of [-L, 0, L, 5 * L]) {
  const seen = new Set();
  for (let d = 0; d < L; d++) seen.add(S.pickIndex(seed, addDays('2026-01-01', start + d)));
  assert.equal(seen.size, L, `${seed} cycle at ${start}`);
}
// a new cycle is a different order
assert.notDeepEqual(S.permutation(L, 'x', 0), S.permutation(L, 'x', 1));
// day numbers across DST
assert.equal(S.dayNumber('2026-03-30') - S.dayNumber('2026-03-29'), 1);
assert.equal(S.dayNumber(S.EPOCH), 0);
// rough uniformity of day-0 picks across many people
const counts = new Array(L).fill(0); for (let i = 0; i < L * 50; i++) counts[S.pickIndex('p' + i, '2026-11-23')]++;
assert.ok(Math.max(...counts) < 120 && Math.min(...counts) > 10, 'spread ' + Math.min(...counts) + '..' + Math.max(...counts));
console.log('select.js: all checks passed (L=' + L + ')', S.pickRef('user-42', '2026-11-23'), S.pickRef('user-43', '2026-11-23'), S.pickRef('user-42', '2026-11-24'));
