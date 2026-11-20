// 日付が変わったら、種の状態のもの（まだ水やりしていない、ほかの人の種）が 3 つになるまで補充する
// 本物の種が足りなければ、運営が用意した種で補う。補充は 1 日 1 回
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };
const list = async p => ((await (await fetch(`${FS}/${p}`, { headers: OWNER })).json()).documents || []);
const v = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : x instanceof Date ? { timestampValue: x.toISOString() } : Array.isArray(x) ? { arrayValue: { values: x.map(v) } } : { integerValue: x };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, v(x)])) }) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });
const browser = await chromium.launch();
const page = await (await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(URL, { waitUntil: 'load' }); await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const me = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => { const a = r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); a.onsuccess = () => res(a.result.find(x => x.value?.uid)?.value.uid); }; }));
const today = new Date(); const dk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 講習を終え、練習の種 3 つ（s0・s1・s7）にはすべて水やり済み。今日はもう補充済み
const ent = i => `s${i}: { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }`;
const let_ = i => `s${i}: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }`;
await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies&updateMask.fieldPaths=sampleLetters&updateMask.fieldPaths=refillDate`, {
  method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true },
    dummies: { mapValue: { fields: Object.fromEntries([0, 1, 7].map(i => ['s' + i, { mapValue: { fields: { x: { integerValue: 50 }, y: { integerValue: 50 } } } }])) } },
    sampleLetters: { mapValue: { fields: Object.fromEntries([0, 1, 7].map(i => ['s' + i, { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } }])) } },
    refillDate: { stringValue: dk(today) } } }) });
// 届け先を探している本物の種が 1 つだけある
await put('seeds/real1', { ownerUid: 'someone', h: '本物の種です。', f: '向き合っています。', flower: 2, createdAt: new Date(), status: 'public', open: true, deliveredCount: 0, deliveredTo: [] });

const user = async () => (await getRaw(`users/${me}`)).fields;
const received = async () => (await list(`worlds/${me}/tiles`)).filter(d => d.fields.kind.stringValue === 'received').length;
const dummies = async () => Object.keys((await user()).dummies?.mapValue?.fields || {}).sort();

await page.reload({ waitUntil: 'load' }); await sleep(3500);
check(await received() === 0 && (await dummies()).length === 3, '今日はもう補充済みなので、種の状態のものが 0 でも届かない');

// 翌日：本物の種 1 つ ＋ 運営の種 2 つで、種の状態のものが 3 つになる
await page.evaluate(() => localStorage.setItem('sabaku-dev-days', '1'));
await page.reload({ waitUntil: 'load' });
let n = 0; for (let i = 0; i < 30 && !n; i++) { await sleep(500); n = await received(); }
await sleep(1500);
const d1 = await dummies();
check(n === 1, `翌日：本物の種が 1 つ届く（${n}）`);
check(d1.length === 5 && d1.filter(k => !['s0', 's1', 's7'].includes(k)).every(k => ['s2', 's3', 's4', 's5', 's6'].includes(k)), `足りない 2 つは、運営が用意した種（練習で使っていない見本）で補う（${d1}）`);
const tomorrow = new Date(Date.now() + 86400000);
check((await user()).refillDate?.stringValue === dk(tomorrow), '補充した日を記録する');
await page.screenshot({ path: 'screenshots/refill_1_next_day.png' });

// 同じ日に開き直しても、もう補充しない
await page.reload({ waitUntil: 'load' }); await sleep(3500);
check(await received() === 1 && (await dummies()).length === 5, '同じ日に開き直しても、補充は 1 日 1 回');

// さらに翌日：水やりしていないので、種の状態のものは 3 つのまま → 何も届かない
await put('seeds/real2', { ownerUid: 'someone', h: '二つ目の本物の種です。', f: '向き合っています。', flower: 3, createdAt: new Date(), status: 'public', open: true, deliveredCount: 0, deliveredTo: [] });
await page.evaluate(() => localStorage.setItem('sabaku-dev-days', '2'));
await page.reload({ waitUntil: 'load' }); await sleep(4000);
check(await received() === 1 && (await dummies()).length === 5, '水やりしていなければ、種の状態のものは 3 つのままで、新しくは届かない');

console.log('errors', errs);
await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
