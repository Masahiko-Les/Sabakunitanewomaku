// 講習中はおばあちゃんの種だけ → 締めの会話のあと、風に乗って練習の種 3 つ（全員共通）が飛んでくる
// → 練習の種のどれかに水やりすると、本物の種が届き始める
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };
const list = async p => ((await (await fetch(`${FS}/${p}`, { headers: OWNER })).json()).documents || []);
const v = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : x instanceof Date ? { timestampValue: x.toISOString() } : Array.isArray(x) ? { arrayValue: { values: x.map(v) } } : { integerValue: x };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, v(x)])) }) });

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });
// ほかの人の、届け先を探している本物の種
await put('seeds/real1', { ownerUid: 'someone', h: '本物の種です。', f: '向き合っています。', flower: 2, createdAt: new Date(), status: 'public', open: true, deliveredCount: 0, deliveredTo: [] });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const next = async label => { for (let i = 0; i < 60; i++) { if (await page.getByText(label, { exact: true }).count()) return; const n = page.locator('#nx'); if (await n.count()) await n.click().catch(() => {}); await sleep(300); } };
const received = async me => (await list(`worlds/${me}/tiles`)).filter(d => d.fields.kind.stringValue === 'received').length;

await page.goto(URL, { waitUntil: 'load' });
await page.locator('#opening #skip').waitFor({ timeout: 15000 }); await page.click('#opening #skip');
await next('おばあちゃんの種を見にいく'); await page.getByText('おばあちゃんの種を見にいく', { exact: true }).click(); await sleep(800);
const me = await uidOf();
await sleep(3000);
check(await received(me) === 0, '講習中は、ほかの人の種は届かない（おばあちゃんの種だけ）');

await page.mouse.click(45, 319); await page.locator('#tL').waitFor({ state: 'visible', timeout: 15000 });
await page.fill('#tL', 'できることを数えるって、すてきですね。'); await page.click('#ok');
await next('花を見る'); await page.getByText('花を見る', { exact: true }).click();
await next('はじめる');
check(!(await getRaw(`users/${me}`)).fields.dummies, '花が咲いても、締めの会話のあいだは練習の種はまだない');
await page.getByText('はじめる', { exact: true }).click();
await sleep(2200); await page.screenshot({ path: 'screenshots/practice_1_gust.png' });
await sleep(800); await page.screenshot({ path: 'screenshots/practice_2_gust.png' });
await page.getByText('ほら砂風に乗って、種が飛んできたよ。やさしい言葉で水やりしてみておくれ。', { exact: true }).waitFor({ timeout: 10000 });
check(true, '風のあと、おばあちゃん「ほら砂風に乗って、種が飛んできたよ。やさしい言葉で水やりしてみておくれ。」');
await page.screenshot({ path: 'screenshots/practice_3_talk.png' });
const dm = (await getRaw(`users/${me}`)).fields.dummies.mapValue.fields;
check(JSON.stringify(Object.keys(dm).sort()) === JSON.stringify(['s0', 's1', 's7']), '練習の種は全員共通の 3 つ');
await page.getByText('閉じる', { exact: true }).click(); await sleep(600);
await page.screenshot({ path: 'screenshots/practice_4_map.png' });
await sleep(2500);
check(await received(me) === 0, '練習の種に水やりするまでは、本物の種は届かない');

// 練習の種をタップして水やり（カメラはおばあちゃんの種のそば）
let opened = null;
for (const [k, val] of Object.entries(dm)) {
  const x = +val.mapValue.fields.x.integerValue, y = +val.mapValue.fields.y.integerValue;
  await page.mouse.click((x + .5) * 48 - 2135, (y + .5) * 48 - 2052);
  try { await page.locator('#tL').waitFor({ state: 'visible', timeout: 8000 }); opened = k; break; } catch {}
}
check(!!opened, `練習の種を開ける（${opened}）`);
await page.fill('#tL', 'それは、つらいですね。'); await page.click('#ok');
await sleep(3000);
check(await received(me) === 0, '練習の種に水やりした日は、まだ本物の種は届かない（補充は翌日から）');
// 翌日（開発用の時計を 1 日進める）：種の状態のもの（練習の種の残り 2 つ）が 3 つになるまで補充 → 本物の種が 1 つ届く
await page.evaluate(() => localStorage.setItem('sabaku-dev-days', '1'));
await page.reload({ waitUntil: 'load' });
let n = 0; for (let i = 0; i < 30 && !n; i++) { await sleep(500); n = await received(me); }
check(n === 1, '翌日には、種の状態のものが 3 つになるよう、本物の種が届く');
const u2 = (await getRaw(`users/${me}`)).fields;
check(Object.keys(u2.dummies.mapValue.fields).length === 3, '本物の種が足りたので、運営の種は足されない');

console.log('errors', errs);
await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
