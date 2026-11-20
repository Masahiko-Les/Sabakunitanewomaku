// 自分の種を「抜く」の確認（「本当に抜く」→ 種・届いた手紙・自分のタイルが消える）
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
import { sowSeed } from './plant-talk.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };
const list = async p => ((await (await fetch(`${FS}/${p}`, { headers: OWNER })).json()).documents || []).map(d => d.name.split('/').pop());
const v = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : x instanceof Date ? { timestampValue: x.toISOString() } : x === null ? { nullValue: null } : { integerValue: x };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, v(x)])) }) });

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });
const browser = await chromium.launch();
const page = await (await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(3000); };

await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const me = await uidOf();
await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies`, {
  method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true },
    dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 0 }, y: { integerValue: 0 } } } } } } } } }) });
await page.reload({ waitUntil: 'load' }); await boot();

// 種を蒔き、ほかの人（other）の世界に届いて、手紙が 1 通届いたことにする
await page.mouse.click(285, 309); await page.waitForTimeout(3500);
await sowSeed(page, '抜く前の種です。', '向き合っています。');
const id = (await list(`worlds/${me}/tiles`))[0];
check(!!id, `種を蒔いた（${id}）`);
const other = 'otherUser';
await put(`worlds/${other}/tiles/${id}`, { seedId: id, x: 50, y: 52, kind: 'received', placedAt: new Date() });
await put(`seeds/${id}/letters/${other}`, { writerUid: other, text: 'すてきですね。', createdAt: new Date(), thanked: false, thankedAt: null });
await page.reload({ waitUntil: 'load' }); await boot();

// わたしの種 → 開く →「抜く」→「本当に抜く」
await page.click('#btnMine'); await page.waitForTimeout(400);
await page.click(`[data-go="${id}"]`); await page.waitForTimeout(1500);
check((await page.textContent('#pull')) === '種を抜く', '自分の種に「種を抜く」がある');
await page.screenshot({ path: 'screenshots/pull_1_sheet.png' });
await page.click('#pull'); await page.waitForTimeout(500);
const cf = await page.textContent('#sheetBody');
check(cf.includes('この種を抜きますか？') && cf.includes('ほかの人の砂漠に届いた種も、いっしょに消えます。') && cf.includes('届いた手紙も、読めなくなります。') && cf.includes('抜いた種は、もとに戻せません。'), '確認画面の文言');
check((await page.textContent('#pNo')) === 'やめておく' && (await page.textContent('#pYes')) === '抜く', '［やめておく］［抜く］');
await page.screenshot({ path: 'screenshots/pull_1b_confirm.png' });
await page.click('#pNo'); await page.waitForTimeout(500);
check((await page.textContent('#sheetBody')).includes('あなたの種') && !!(await getRaw(`seeds/${id}`)), '「やめておく」で自分の種に戻り、抜かれていない');
await page.click('#pull'); await page.waitForTimeout(500);
await page.click('#pYes'); await page.waitForTimeout(2000);
check((await page.textContent('#toast')).includes('種を抜きました'), 'トースト「種を抜きました」');
check(!(await page.evaluate(() => document.querySelector('#sheet').classList.contains('on'))), 'シートが閉じる');
await page.screenshot({ path: 'screenshots/pull_2_after.png' });
check(!(await getRaw(`seeds/${id}`)), '種そのものが消えた');
check((await list(`seeds/${id}/letters`)).length === 0, '届いた手紙も消えた');
check(!(await getRaw(`worlds/${me}/tiles/${id}`)), '自分の世界のタイルが消えた');

await page.reload({ waitUntil: 'load' }); await boot();
await page.click('#btnMine'); await page.waitForTimeout(400);
check(!(await page.textContent('#sheetBody')).includes('抜く前の種です。'), '再読み込みしても、わたしの種にない');

// 他人の種には「抜く」はない（届いた種）
const rid = 'received1';
await put(`seeds/${rid}`, { ownerUid: other, h: '届いた種です。', f: '向き合っています。', flower: 1, createdAt: new Date(), status: 'public', open: false, deliveredCount: 1 });
await fetch(`${FS}/seeds/${rid}?updateMask.fieldPaths=deliveredTo`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: { deliveredTo: { arrayValue: { values: [{ stringValue: me }] } } } }) });
await put(`worlds/${me}/tiles/${rid}`, { seedId: rid, x: 53, y: 50, kind: 'received', placedAt: new Date() });
await page.reload({ waitUntil: 'load' }); await boot();
await page.mouse.click(285 + 48, 309); await page.waitForTimeout(1500);
check((await page.textContent('#sheetBody')).includes('届いた種です。') && !(await page.$('#pull')), '届いた種には「抜く」がない');

console.log('errors', errs);
await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
