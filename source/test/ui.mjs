// Drive the real UI in Chrome: 4 tabs in one browser context talk over BroadcastChannel (?local).
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:5173/';
const OUT = '/home/claude/felha/test/shots'; fs.mkdirSync(OUT, { recursive: true });
const N = +(process.env.N || 4);
const errors = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ar-SA' });
const pages = [];
async function open(i, hash = '') {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(`[p${i}] ${m.text()}`); });
  p.on('pageerror', e => errors.push(`[p${i}] PAGEERROR ${e.message}`));
  await p.goto(`${BASE}?local&tab=${i}${hash}`);
  return p;
}
const shot = async (p, name, full = false) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const names = ['فهد', 'نورة', 'سعود', 'ريم', 'خالد', 'لمى'];
// host
const h = await open(1); pages.push(h);
await h.fill('#nm', names[0]);
await h.waitForTimeout(2800); await shot(h, '00-home');
await h.getByRole('button', { name: 'سوّ روم جديدة' }).click();
await h.waitForSelector('.lobby', { timeout: 15000 });
const code = await h.$eval('.codechip b', e => e.textContent.trim());
console.log('room', code);
for (let i = 2; i <= N; i++) {
  const p = await open(i, '#' + code); pages.push(p);
  await p.fill('#nm', names[i - 1]);
  await p.getByRole('button', { name: 'ادخل الروم' }).click();
  await p.waitForSelector('.lobby', { timeout: 15000 });
}
await h.waitForTimeout(1500);
const nPlayers = await h.$$eval('.plist .prow', els => els.length);
console.log('players in host lobby', nPlayers);
await shot(h, '01-lobby-phone', true);
await h.setViewportSize({ width: 1280, height: 860 });
await shot(h, '02-lobby-desktop', true);
await h.setViewportSize({ width: 390, height: 844 });

const GAMES = (process.env.GAMES || 'imposter,whoami,mafia,wyr,mlt,bluff,draw,phone,bomb,cats,trivia,emoji,codenames,wave,feud').split(',');
const names2 = { imposter: 'برا السالفة', whoami: 'مين أنا', mafia: 'مافيا', wyr: 'لو خيروك', mlt: 'مين الأكثر', bluff: 'صدّقني', draw: 'ارسم وخمّن', phone: 'تلفون خربان', bomb: 'القنبلة', cats: 'إنسان حيوان جماد', trivia: 'مسابقة', emoji: 'خمّن الإيموجي', codenames: 'الشفرة', wave: 'مقياس', feud: 'قالوا الناس' };
for (const g of GAMES) {
  await h.click(`.tile:has-text("${names2[g]}")`);
  await h.waitForTimeout(300);
  const startBtn = h.locator('.picked .btn-main');
  if (await startBtn.isDisabled()) { console.log(g, 'start disabled'); continue; }
  await startBtn.click();
  await h.waitForSelector('.game', { timeout: 10000 });
  await h.waitForTimeout(900);
  await shot(h, `g-${g}-host`);
  await shot(pages[1], `g-${g}-p2`);
  // tiny interaction per game to exercise a second screen
  try { await interact(g); } catch (e) { console.log('interact', g, e.message.split('\n')[0]); }
  // end the game from the host menu
  await h.click('.gbar .pmenu .iconbtn');
  h.once('dialog', d => d.accept());
  await h.click('.pmenu-list .danger');
  await h.waitForSelector('.results', { timeout: 8000 });
  if (g === GAMES[0]) await shot(h, `r-${g}-results`, true);
  await h.click('.results .btn-ghost');
  await h.waitForSelector('.lobby', { timeout: 8000 });
}
async function interact(g) {
  const P = pages;
  if (g === 'imposter') { for (const p of P) { await p.click('.reveal'); } await shot(P[1], 'g-imposter-card'); for (const p of P) await p.click('.phase .btn-main'); await h.waitForTimeout(700); await shot(h, 'g-imposter-ask'); }
  if (g === 'wyr') { for (const p of P) await p.click('.wyr-opt.o0'); await h.waitForTimeout(900); await shot(h, 'g-wyr-reveal'); }
  if (g === 'trivia') { for (const p of P) await p.click('.tr-o >> nth=1'); await h.waitForTimeout(900); await shot(h, 'g-trivia-reveal'); }
  if (g === 'draw') {
    await h.waitForTimeout(300);
    // whoever is drawing picks the first word, then draws a stroke
    for (const p of P) { const b = p.locator('.choices .btn'); if (await b.count()) { await b.first().click(); await p.waitForTimeout(400); const c = await p.$('canvas.ink.can'); if (c) { const bb = await c.boundingBox(); await p.mouse.move(bb.x + 40, bb.y + 40); await p.mouse.down(); for (let k = 0; k < 20; k++) await p.mouse.move(bb.x + 40 + k * 12, bb.y + 40 + Math.sin(k / 2) * 40); await p.mouse.up(); } await p.waitForTimeout(600); await shot(p, 'g-draw-drawer'); } }
    await P[1].waitForTimeout(500); await shot(P[1], 'g-draw-viewer'); await shot(P[2], 'g-draw-viewer2');
  }
  if (g === 'cats') { await shot(P[1], 'g-cats-write'); }
  if (g === 'codenames') { await shot(P[2], 'g-codenames-p3'); }
  if (g === 'wave') { await shot(P[2], 'g-wave-p3'); }
  if (g === 'bomb') { await h.waitForTimeout(500); await shot(P[2], 'g-bomb-p3'); }
}
console.log('errors', errors.length); errors.slice(0, 20).forEach(e => console.log(e));
await browser.close();
