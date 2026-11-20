// 「この種を知らせる」「この手紙を知らせる」の確認
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
import { sowSeed } from './plant-talk.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };
const v = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : Array.isArray(x) ? { arrayValue: { values: x.map(v) } }
  : x instanceof Date ? { timestampValue: x.toISOString() } : x === null ? { nullValue: null } : { integerValue: x };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, v(x)])) }) });

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

// ほかのテストの種が届かないよう、Emulator のデータを空にしてから始める
await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });
const browser = await chromium.launch();
const page = await (await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(3000); };
const body = () => page.textContent('#sheetBody');
const sheetOn = () => page.evaluate(() => document.querySelector('#sheet').classList.contains('on'));

await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const me = await uidOf();
await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies&updateMask.fieldPaths=sampleLetters`, {
  method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true }, dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 0 }, y: { integerValue: 0 } } } } } } }, sampleLetters: { mapValue: { fields: { s0: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } } } } } } }) });
await page.reload({ waitUntil: 'load' }); await boot();

// 自分の種を蒔いて、そのマスの位置を知る
await page.mouse.click(285, 309); await page.waitForTimeout(3500);
await sowSeed(page, 'わたしの種です。', '向き合っています。'); await page.waitForTimeout(1000);
const mineId = (await (await fetch(`${FS}/worlds/${me}/tiles`, { headers: OWNER })).json()).documents[0].name.split('/').pop();
const mt = (await getRaw(`worlds/${me}/tiles/${mineId}`)).fields, X = +mt.x.integerValue, Y = +mt.y.integerValue;

// 届いた種を、となりのマスに置く。自分の種には、ほかの人からの手紙を 2 通
const other = 'otherUser', other2 = 'otherUser2', rid = 'received1';
await put(`seeds/${rid}`, { ownerUid: other, h: 'ひどいことが書いてある種。', f: 'ひどいこと。', flower: 1, createdAt: new Date(), status: 'public', open: true, deliveredCount: 1, deliveredTo: [me] });
await put(`worlds/${me}/tiles/${rid}`, { seedId: rid, x: X + 1, y: Y, kind: 'received', placedAt: new Date() });
for (const [w, t] of [[other, 'ひどい手紙です。'], [other2, 'やさしい手紙です。']])
  await put(`seeds/${mineId}/letters/${w}`, { writerUid: w, text: t, createdAt: new Date(), thanked: false, thankedAt: null });
await page.reload({ waitUntil: 'load' }); await boot();

// ── 種を知らせる
await page.mouse.click(285 + 48, 309); await page.waitForTimeout(1500);
check((await body()).includes('ひどいことが書いてある種。'), '届いた種を開ける');
check((await page.textContent('#rep')) === 'この種を知らせる', '「この種を知らせる」がある');
await page.screenshot({ path: 'screenshots/rep_1_seed.png' });
await page.click('#rep'); await page.waitForTimeout(300);
check((await page.textContent('#rep')) === '本当に知らせる', '1 回押すと「本当に知らせる」');
await page.click('#rep'); await page.waitForTimeout(1500);
check((await page.textContent('#toast')).includes('知らせました。この種は、あなたの世界から見えなくなります'), 'トースト（種）');
check(!!(await getRaw(`reports/${me}_${rid}`)), 'reports に記録された（種）');
check(!(await getRaw(`worlds/${me}/tiles/${rid}`)), '自分の世界のタイルは消えた');
await page.reload({ waitUntil: 'load' }); await boot();
await page.mouse.click(285 + 48, 309); await page.waitForTimeout(1500);
check(!(await sheetOn()), '再読み込みしても、そのマスには種がない');

// ── 手紙を知らせる
await page.click('#btnMine'); await page.waitForTimeout(400);
await page.click(`[data-go="${mineId}"]`); await page.waitForTimeout(1500);
let t = await body();
check(t.includes('ひどい手紙です。') && t.includes('やさしい手紙です。'), '自分の種に 2 通の手紙');
check((await page.$$('[data-rep]')).length === 2, '手紙ごとに「この手紙を知らせる」がある');
await page.screenshot({ path: 'screenshots/rep_2_letters.png' });
const b = `[data-rep="${other}"]`;
await page.click(b); await page.waitForTimeout(300);
check((await page.textContent(b)) === '本当に知らせる', '1 回押すと「本当に知らせる」');
await page.click(b); await page.waitForTimeout(1500);
check((await page.textContent('#toast')).includes('知らせました。この手紙は、もう表示されません'), 'トースト（手紙）');
t = await body();
check(!t.includes('ひどい手紙です。') && t.includes('やさしい手紙です。'), '知らせた手紙だけ表示されなくなった');
await page.screenshot({ path: 'screenshots/rep_3_after.png' });
check(!!(await getRaw(`reports/${me}_${mineId}_${other}`)), 'reports に記録された（手紙）');
check((await getRaw(`users/${me}`))?.fields?.muted?.mapValue?.fields?.[`${mineId}_${other}`]?.booleanValue === true, 'users.muted に入った');
await page.reload({ waitUntil: 'load' }); await boot();
await page.click('#btnMine'); await page.waitForTimeout(400);
await page.click(`[data-go="${mineId}"]`); await page.waitForTimeout(1500);
t = await body();
check(!t.includes('ひどい手紙です。') && t.includes('やさしい手紙です。'), '再読み込みしても、知らせた手紙は出ない');

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
