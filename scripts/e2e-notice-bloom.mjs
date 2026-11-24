// 手紙が届いたときのお知らせ（画面の中央）と、花が咲くときの光り輝く演出
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };
const v = x => x === null ? { nullValue: null } : typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : x instanceof Date ? { timestampValue: x.toISOString() } : Array.isArray(x) ? { arrayValue: { values: x.map(v) } } : { integerValue: x };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, v(x)])) }) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

const samples = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map(i => ['s' + i, { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }]));
const sampleLetters = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map(i => ['s' + i, { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }]));
const browser = await chromium.launch();
async function player(sky = 'day') {
  const ctx = await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, keepNotice: true });
  await ctx.addInitScript(s => localStorage.setItem('sabaku-sky', s), sky);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL, { waitUntil: 'load' }); await page.locator('#sheet.on').waitFor({ timeout: 15000 });
  const me = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => { const a = r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); a.onsuccess = () => res(a.result.find(x => x.value?.uid)?.value.uid); }; }));
  await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies&updateMask.fieldPaths=sampleLetters&updateMask.fieldPaths=refillDate`, {
    method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true },
      dummies: { mapValue: { fields: samples } }, sampleLetters: { mapValue: { fields: sampleLetters } }, refillDate: { stringValue: '2999-01-01' } } }) });
  return { ctx, page, me, errs };
}
const boot = async page => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await sleep(2000); };
const noticeOn = page => page.evaluate(() => document.querySelector('#notice').classList.contains('on'));
const sheetOn = page => page.evaluate(() => document.querySelector('#sheet').classList.contains('on'));
const ownSeed = async (me, id, x, y) => {
  await put(`seeds/${id}`, { ownerUid: me, h: 'わたしの種です。', f: '向き合っています。', flower: 0, createdAt: new Date(), status: 'public', open: true, deliveredCount: 0, deliveredTo: [] });
  await put(`worlds/${me}/tiles/${id}`, { seedId: id, x, y, kind: 'own', placedAt: new Date() });
};
const letter = (seed, writer, text) => put(`seeds/${seed}/letters/${writer}`, { writerUid: writer, text, createdAt: new Date(), thanked: false, thankedAt: null });

await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });

// ── 開いているあいだに手紙が届く → お知らせ → 種を見てみる → ありがとう → 光の演出（昼）
{
  const { ctx, page, me, errs } = await player();
  await ownSeed(me, 'own1', 46, 50); await boot(page);
  check(!(await noticeOn(page)), '手紙がまだなければ、お知らせは出ない');
  await letter('own1', 'friend1', 'ゆっくりで大丈夫です。');
  await page.locator('#notice.on').waitFor({ timeout: 8000 }).catch(() => {});
  check(await noticeOn(page), '手紙が届くと、画面の中央にお知らせが出る');
  check((await page.textContent('#notice')).replace(/\s+/g, '') === 'やさしい言葉が届きましたあとで種を見てみる', 'お知らせの文言');
  await sleep(400); await page.screenshot({ path: 'screenshots/notice_1_day.png' });
  await page.mouse.click(30, 120); await sleep(300);
  check(await noticeOn(page), 'お知らせのあいだは、マップを触っても閉じない（ほかの操作を受け付けない）');
  await page.click('#noticeGo'); await sleep(900);
  check(!(await noticeOn(page)) && await sheetOn(page) && (await page.textContent('#sheetBody')).includes('ゆっくりで大丈夫です。'), '「種を見てみる」で、その種のところへ行き、手紙が読める');
  await page.locator('[data-thx]').first().click(); const t0 = Date.now();
  for (const [ms, name] of [[700, '2_burst_flash'], [1500, '3_burst_rays'], [2600, '4_burst_sparks'], [4200, '5_burst_after']]) {
    while (Date.now() - t0 < ms) await sleep(20); await page.screenshot({ path: `screenshots/bloom_${name}.png` });
  }
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('sabaku-bloom-shown') || '[]'));
  check(n.includes('own1'), 'ありがとうを返すと、花が咲く光の演出が出る');
  await boot(page);
  check(!(await noticeOn(page)), '同じ手紙のお知らせは、開き直しても出ない');
  console.log('errors', errs); await ctx.close();
}

// ── 「あとで」：閉じるだけ。閉じているあいだに届いた手紙は、次に開いたときにお知らせ
{
  const { ctx, page, me, errs } = await player();
  await ownSeed(me, 'own2', 46, 50);
  await letter('own2', 'friend2', '閉じているあいだの手紙です。');
  await boot(page); await sleep(800);
  check(await noticeOn(page), '閉じているあいだに届いた手紙も、開いたときにお知らせが出る');
  await page.click('#noticeLater'); await sleep(400);
  check(!(await noticeOn(page)) && !(await sheetOn(page)), '「あとで」で閉じる');
  await boot(page); await sleep(800);
  check(!(await noticeOn(page)), '「あとで」のあとも、同じ手紙では二度と出ない');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#dot')).display !== 'none'), '「わたしの種」の点は残る');
  console.log('errors', errs); await ctx.close();
}

// ── 水をあげた側：ありがとうが返ってきたとき（夜）と、閉じているあいだに返ってきたとき
{
  const { ctx, page, me, errs } = await player('night');
  for (const [id, x] of [['rc1', 52], ['rc2', 47]]) {
    await put(`seeds/${id}`, { ownerUid: 'someone', h: '届いた種です。', f: '向き合っています。', flower: id === 'rc1' ? 3 : 1, createdAt: new Date(), status: 'public', open: true, deliveredCount: 1, deliveredTo: [me] });
    await put(`worlds/${me}/tiles/${id}`, { seedId: id, x, y: 50, kind: 'received', placedAt: new Date() });
    await letter(id, me, 'わたしの手紙です。');
  }
  await boot(page);
  await put(`seeds/rc1/letters/${me}`, { writerUid: me, text: 'わたしの手紙です。', createdAt: new Date(), thanked: true, thankedAt: new Date() });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sabaku-bloom-shown') || '[]').includes('rc1'), null, { timeout: 8000 }).catch(() => {});
  const t0 = Date.now(); check(await page.evaluate(() => JSON.parse(localStorage.getItem('sabaku-bloom-shown') || '[]').includes('rc1')), 'ありがとうが返ってくると、光の演出が出る');
  for (const [ms, name] of [[500, '6_night_flash'], [1600, '7_night_rays'], [3000, '8_night_sparks']]) {
    while (Date.now() - t0 < ms) await sleep(20); await page.screenshot({ path: `screenshots/bloom_${name}.png` });
  }
  await sleep(2500);
  // 閉じているあいだに返ってきたありがとう
  await put(`seeds/rc2/letters/${me}`, { writerUid: me, text: 'わたしの手紙です。', createdAt: new Date(), thanked: true, thankedAt: new Date() });
  await boot(page);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('sabaku-bloom-shown') || '[]').includes('rc2')), '閉じているあいだに返ってきたありがとうも、開いたときに光の演出');
  await sleep(5000);
  await page.evaluate(() => { window.__b = 0; });
  await boot(page);
  check(!(await noticeOn(page)), '自分の手紙にありがとうが返っても、お知らせは出ない（お知らせは届いた手紙だけ）');
  console.log('errors', errs); await ctx.close();
}

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
