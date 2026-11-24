// 水やりのあと、画面の中央で種を大きく映して、芽が出るところを見せる演出
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };
const v = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : x instanceof Date ? { timestampValue: x.toISOString() } : Array.isArray(x) ? { arrayValue: { values: x.map(v) } } : { integerValue: x };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, v(x)])) }) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

const browser = await chromium.launch();
async function player({ sky = 'day', reduced = false } = {}) {
  const ctx = await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(s => localStorage.setItem('sabaku-sky', s), sky);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.locator('#sheet.on').waitFor({ timeout: 15000 });
  const me = await page.evaluate(() => new Promise(res => {
    const req = indexedDB.open('firebaseLocalStorageDb');
    req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
      a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  }));
  await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies&updateMask.fieldPaths=sampleLetters`, {
    method: 'PATCH', headers: OWNER,
    body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true },
      dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }, s1: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }, s2: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }, s3: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }, s4: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }, s5: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }, s6: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }, s7: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } } } } },
      sampleLetters: { mapValue: { fields: { s0: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }, s1: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }, s2: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }, s3: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }, s4: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }, s5: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }, s6: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }, s7: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } } } } } } }) });
  return { ctx, page, me, errs };
}
const boot = async page => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(2500); };
const sheetOn = page => page.evaluate(() => document.querySelector('#sheet').classList.contains('on'));
async function receive(me, id, x, y) {
  await put(`seeds/${id}`, { ownerUid: 'someone', h: '届いた種です。', f: '向き合っています。', flower: 1, createdAt: new Date(), status: 'public', open: true, deliveredCount: 1, deliveredTo: [me] });
  await put(`worlds/${me}/tiles/${id}`, { seedId: id, x, y, kind: 'received', placedAt: new Date() });
}
async function openAndWrite(page, text) {
  await page.mouse.click(285, 309); // マス (52,50)
  await page.locator('#tL').waitFor({ state: 'visible', timeout: 10000 });
  await page.fill('#tL', text);
}

await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });
const zoomOn = page => page.evaluate(() => document.querySelector('#zoom').classList.contains('on'));

// ── 昼：マップの水やりのあと、拡大して芽が出る → 自動で閉じる
{
  const { ctx, page, me, errs } = await player();
  await receive(me, 'z1', 52, 50); await boot(page);
  await openAndWrite(page, '芽が出ますように。');
  await page.click('#ok'); const t0 = Date.now();
  // すでに種の隣にいるので歩きは省略（演出は 1.2 秒目から）。マップの芽が開ききる 5.3 秒目＝ここでは 4.1 秒
  while (Date.now() - t0 < 3600) await sleep(30);
  check(!(await zoomOn(page)), 'マップの芽が開ききるまでは、拡大しない');
  await page.waitForFunction(() => document.querySelector('#zoom').classList.contains('on'), null, { timeout: 4000 }).catch(() => {});
  const tz = Date.now(); check(await zoomOn(page), 'マップの水やり演出のあと、画面の中央で拡大する');
  for (const [ms, name] of [[350, '1_drops'], [1500, '2_crack'], [2300, '3_stem'], [3400, '4_leaves'], [4300, '5_motes']]) {
    while (Date.now() - tz < ms) await sleep(15); await page.screenshot({ path: `screenshots/zoom_${name}.png` });
    if (ms === 1500) { await page.evaluate(() => document.querySelector('#btnMine').click()); await sleep(100);
      check(!(await sheetOn(page)), '拡大のあいだは、ほかの操作を受け付けない'); }
  }
  while (Date.now() - tz < 5600) await sleep(50);
  check(!(await zoomOn(page)), '終わったら自動で閉じる');
  await page.click('#btnMine'); await sleep(400);
  check(await sheetOn(page), '閉じたら、操作できる');
  console.log('errors', errs); await ctx.close();
}

// ── タップで閉じる（夜）
{
  const { ctx, page, me, errs } = await player({ sky: 'night' });
  await receive(me, 'z2', 52, 50); await boot(page);
  await openAndWrite(page, '夜の水やりです。');
  await page.click('#ok');
  await page.waitForFunction(() => document.querySelector('#zoom').classList.contains('on'), null, { timeout: 9000 }).catch(() => {});
  await sleep(2600); await page.screenshot({ path: 'screenshots/zoom_6_night.png' });
  await page.mouse.click(195, 390); await sleep(600);
  check(!(await zoomOn(page)), 'タップすると閉じる');
  console.log('errors', errs); await ctx.close();
}

// ── 「視差効果を減らす」：拡大しない
{
  const { ctx, page, me } = await player({ reduced: true });
  await receive(me, 'z3', 52, 50); await boot(page);
  await openAndWrite(page, '動きを減らす設定です。');
  await page.click('#ok'); await sleep(1500);
  check(!(await zoomOn(page)), '視差効果を減らす設定では、拡大しない');
  await ctx.close();
}

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
