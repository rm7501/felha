// Shared helpers (no DOM)
export const uid = (n = 8) => {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const r = (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : null;
  for (let i = 0; i < n; i++) s += a[(r ? r[i] : Math.floor(Math.random() * 256)) % a.length];
  return s;
};
export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const sample = (arr, n) => shuffle(arr).slice(0, n);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sum = arr => arr.reduce((s, x) => s + x, 0);
export const zeroPts = ids => Object.fromEntries(ids.map(id => [id, 0]));

// digits: Arabic-Indic / Persian → western
export const westDigits = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// Arabic normalisation for comparing answers
export const norm = s => westDigits(String(s || ''))
  .toLowerCase()
  .replace(/[ً-ْٰـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[^\p{L}\p{N} ]+/gu, ' ')
  .replace(/\s+/g, ' ').trim();
// drop leading "ال" on every word (and common joined prefixes "وال" / "بال")
export const loose = s => norm(s).split(' ').map(w => w.length > 3 ? w.replace(/^(وال|بال|فال|ال)/, '') : w).join(' ').replace(/ /g, '');
export const stripAl = w => (w.length > 3 ? w.replace(/^(وال|بال|فال|لل|ال)/, '') : w);

export function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const tol = n => (n <= 3 ? 0 : n <= 6 ? 1 : 2);
// does guess match any of the accepted answers? returns 'yes' | 'close' | 'no'
export function judge(guess, answers) {
  const g = loose(guess);
  if (!g) return 'no';
  let close = false;
  for (const a of answers) {
    const t = loose(a);
    if (!t) continue;
    if (g === t) return 'yes';
    const d = lev(g, t);
    if (d <= tol(t.length)) return 'yes';
    if (d <= tol(t.length) + 2 || (g.length >= 4 && (t.includes(g) || g.includes(t)))) close = true;
  }
  return close ? 'close' : 'no';
}
// "answer/alias/alias" → ['answer','alias',...]
export const alts = s => String(s).split('/').map(x => x.trim()).filter(Boolean);
export const lines = s => String(s).split('\n').map(x => x.trim()).filter(Boolean);
export const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
export const EASY_LETTERS = 'ابتجحخدرزسشصعفقكلمنهوي'.split('');
// first letter of an answer for إنسان حيوان جماد (ignores "ال")
export const firstLetter = s => { const w = norm(s).split(' ')[0] || ''; const x = stripAl(w); return x[0] || ''; };
export const normLetter = ch => norm(ch)[0] || '';

// placement from points map → [{pid, pts, place}]
export function rank(pts) {
  const rows = Object.entries(pts).map(([pid, p]) => ({ pid, pts: p })).sort((a, b) => b.pts - a.pts);
  let place = 0, last = null;
  rows.forEach((r, i) => { if (r.pts !== last) { place = i + 1; last = r.pts; } r.place = place; });
  return rows;
}
export const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
