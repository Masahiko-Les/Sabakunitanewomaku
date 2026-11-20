// 種と芽は蒔いてから 1 週間で消え、花は残る／配達は蒔いてから 24 時間まで、の確認
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const list = async p => ((await (await fetch(`${FS}/${p}`, { headers: OWNER })).json()).documents || []).map(d => d.name.split('/').pop());
const v = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : Array.isArray(x) ? { arrayValue: { values: x.map(v) } }
  : x instanceof Date ? { timestampValue: x.toISOString() } : x === null ? { nullValue: null } : { integerValue: x };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, v(x)])) }) });
const ago = h => new Date(Date.now() - h * 3600000);
const seed = (id, owner, h, createdAt, o = {}) => put(`seeds/${id}`, { ownerUid: owner, h, f: '向き合っています。', flower: 1, createdAt,
  status: 'public', open: true, deliveredCount: 0, deliveredTo: [], ...o });
const letter = (id, writer, thanked) => put(`seeds/${id}/letters/${writer}`, { writerUid: writer, text: 'すてきですね。', createdAt: ago(100),
  thanked, thankedAt: thanked ? ago(90) : null });
const tile = (uid, id, x, y, kind) => put(`worlds/${uid}/tiles/${id}`, { seedId: id, x, y, kind, placedAt: ago(100) });

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

const browser = await chromium.launch();
const page = await (await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(3000); };
const mineList = async () => { await page.click('#btnMine'); await page.waitForTimeout(500); const t = await page.textContent('#sheetBody'); await page.click('#x'); await page.waitForTimeout(300); return t; };

await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const me = await uidOf();
await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies`, {
  method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true }, dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 0 }, y: { integerValue: 0 } } } } } } } } }) });

const T = Date.now().toString(36), other = 'other' + T;
// 自分の種：①6日目の種 ②8日目の種（手紙なし）③8日目の芽（ありがとうなし）④8日目の花
await seed('own6' + T, me, '六日目の種。', ago(24 * 6), { open: false }); await tile(me, 'own6' + T, 52, 53, 'own');
await seed('own8' + T, me, '八日目の種。', ago(24 * 8), { open: false }); await tile(me, 'own8' + T, 53, 52, 'own');
await seed('spr8' + T, me, '八日目の芽。', ago(24 * 8), { open: false }); await tile(me, 'spr8' + T, 48, 53, 'own'); await letter('spr8' + T, other, false);
await seed('flo8' + T, me, '八日目の花。', ago(24 * 8), { open: false }); await tile(me, 'flo8' + T, 47, 53, 'own'); await letter('flo8' + T, other, true);
// 届いた種：⑤8日目、自分の手紙にありがとうなし ⑥8日目、ありがとうが返った
await seed('rsp8' + T, other, '届いた八日目の芽。', ago(24 * 8), { open: false, deliveredCount: 1, deliveredTo: [me] }); await tile(me, 'rsp8' + T, 53, 48, 'received'); await letter('rsp8' + T, me, false);
await seed('rfl8' + T, other, '届いた八日目の花。', ago(24 * 8), { open: false, deliveredCount: 1, deliveredTo: [me] }); await tile(me, 'rfl8' + T, 52, 47, 'received'); await letter('rfl8' + T, me, true);
// 配達：25 時間前の種と、1 時間前の種
await seed('old' + T, other, '二十五時間前の種。', ago(25));
await seed('new' + T, other, '一時間前の種。', ago(1));

await page.reload({ waitUntil: 'load' }); await boot();
const t = await mineList();
check(t.includes('六日目の種。'), '6 日目の種は、まだある');
check(!t.includes('八日目の種。'), '8 日目の種（手紙なし）は消えた');
check(!t.includes('八日目の芽。'), '8 日目の芽（ありがとうなし）は消えた');
check(/(^|[^た])八日目の花。/.test(t), '8 日目でも、花は残る');
check(!t.includes('届いた八日目の芽。'), '届いた種：8 日目で、ありがとうが返っていない芽は消えた');
check(t.includes('届いた八日目の花。'), '届いた種：ありがとうが返って咲いた花は残る');
await page.screenshot({ path: 'screenshots/exp_1_world.png' });

// 花になった 8 日目の種：手紙はあるが、もうありがとうも自分への手紙も書けない
await page.click('#btnMine'); await page.waitForTimeout(400);
await page.click(`[data-go="flo8${T}"]`); await page.waitForTimeout(1200);
const fb = await page.textContent('#sheetBody');
check(fb.includes('あなたの種') && fb.includes('花が咲いています'), '8 日目の花を開ける');
check(!(await page.$('#selfBtn')), '1 週間を過ぎた種には、自分への手紙は書けない（ボタンがない）');
await page.click('#x'); await page.waitForTimeout(400);

// 配達
await page.waitForTimeout(2000);
const tiles = await list(`worlds/${me}/tiles`);
check(tiles.includes('new' + T), '蒔いてから 1 時間の種は届いた');
check(!tiles.includes('old' + T), '蒔いてから 25 時間の種は届かない（届け先が 5 人に満たなくても、そこで終わり）');

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
