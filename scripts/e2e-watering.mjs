// 水やりの演出（女の子がじょうろで種に水をあげる）の確認
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
import { chooseStandTile, WATERING_TIMELINE } from '../src/watering/watering-animation.js';

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

// ── 立ち位置（上下左右）：種の上下左右のうち、歩けて一番近いマス。向きは種のほう
const seed = { x: 10, y: 10 };
check(chooseStandTile(seed, { x: 7, y: 10 }).facing === 'right', '左から近づくと、左のマスに立って右を向く');
check(chooseStandTile(seed, { x: 13, y: 10 }).facing === 'left', '右から近づくと、右のマスに立って左を向く');
check(chooseStandTile(seed, { x: 10, y: 13 }).facing === 'up', '下から近づくと、下のマスに立つ（上向き）');
check(chooseStandTile(seed, { x: 10, y: 7 }).facing === 'down', '上から近づくと、上のマスに立つ（下向き）');
check(chooseStandTile(seed, { x: 9, y: 10 }).x === 9, 'すでに隣にいるときは、そのマス（歩かない）');
check(chooseStandTile(seed, { x: 7, y: 10 }, (x, y) => x !== 9).x !== 9, '塞がっているマスには立たない');
check(chooseStandTile(seed, { x: 7, y: 10 }, () => false) === null, '4 方向とも塞がっていれば null（その場で演出だけ）');
check(WATERING_TIMELINE.inputUnlock === 4.0 && WATERING_TIMELINE.total === 7.0, 'タイムライン：4 秒で操作を返し、7 秒で終わる');

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
      dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 0 }, y: { integerValue: 0 } } } } } } },
      sampleLetters: { mapValue: { fields: { s0: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } } } } } } }) });
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

// ── 昼：水やり → 演出 → 芽のまま残る
{
  const { ctx, page, me, errs } = await player();
  await receive(me, 'w1', 52, 50); await boot(page);
  await openAndWrite(page, 'それは、つらかったですね。');
  await page.click('#ok'); const t0 = Date.now();
  await sleep(300);
  check(!(await sheetOn(page)), '保存できたら、手紙のシートを閉じて演出が始まる');
  check(!!(await getRaw(`seeds/w1/letters/${me}`)), '演出の前に、手紙は保存されている');
  await page.screenshot({ path: 'screenshots/water_1_start.png' });
  await page.click('#btnMine'); await sleep(300);
  check(!(await sheetOn(page)), '演出中（4 秒まで）は、ほかの操作を受け付けない');
  while (Date.now() - t0 < 2600) await sleep(30);
  await page.screenshot({ path: 'screenshots/water_2_pour.png' });
  while (Date.now() - t0 < 4900) await sleep(30);
  await page.screenshot({ path: 'screenshots/water_3_sprout.png' });
  await page.click('#btnMine'); await sleep(400);
  check(await sheetOn(page), '4 秒を過ぎると、操作できる');
  await page.click('#x'); await sleep(2600);
  await page.screenshot({ path: 'screenshots/water_4_end.png' });
  await boot(page);
  await page.click('#btnMine'); await sleep(500);
  check((await page.textContent('#sheetBody')).includes('芽が出ています'), '再読み込みしても、芽のまま');
  console.log('errors', errs); await ctx.close();
}

// ── 保存に失敗したとき：演出は出ない（シートはそのまま、もう一度押せる）
{
  const { ctx, page, me, errs } = await player();
  await receive(me, 'w2', 52, 50); await boot(page);
  await openAndWrite(page, '保存できない手紙です。');
  await fetch(`${FS}/worlds/${me}/tiles/w2`, { method: 'DELETE', headers: OWNER }); // 自分の世界にない種には、ルールで書けない
  await page.click('#ok'); await sleep(1500);
  check(await sheetOn(page), '保存に失敗したら、シートは閉じない（演出は出ない）');
  check(!(await page.isDisabled('#ok')), '「水をあげる」をもう一度押せる');
  check(!(await getRaw(`seeds/w2/letters/${me}`)), '手紙は保存されていない');
  await page.screenshot({ path: 'screenshots/water_5_failed.png' });
  console.log('errors (保存失敗のログは想定どおり)', errs.length); await ctx.close();
}

// ── 夜：水滴・波紋・芽が見える
{
  const { ctx, page, me } = await player({ sky: 'night' });
  await receive(me, 'w3', 52, 50); await boot(page);
  await openAndWrite(page, '夜の水やりです。');
  await page.click('#ok'); const t0 = Date.now();
  while (Date.now() - t0 < 2600) await sleep(30);
  await page.screenshot({ path: 'screenshots/water_6_night_pour.png' });
  while (Date.now() - t0 < 5600) await sleep(30);
  await page.screenshot({ path: 'screenshots/water_7_night_sprout.png' });
  await ctx.close();
}

// ── 「視差効果を減らす」：すぐに完成状態
{
  const { ctx, page, me } = await player({ reduced: true });
  await receive(me, 'w4', 52, 50); await boot(page);
  await openAndWrite(page, '動きを減らす設定です。');
  await page.click('#ok'); await sleep(600);
  await page.click('#btnMine'); await sleep(400);
  check(await sheetOn(page), '視差効果を減らす設定では、すぐに操作できる（演出は完成状態）');
  await ctx.close();
}

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
