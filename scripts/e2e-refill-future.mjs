// 「次の日にする」で何日も進めても、本物の種が届く（ルールは、サーバーの時刻より先の受け取り日を受け付けない）
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

// 「次の日にする」を何度も押して、端末の日付がサーバーより 3 日以上先になっても、本物の種は届く
await page.evaluate(() => localStorage.setItem('sabaku-dev-days', '4'));
await page.reload({ waitUntil: 'load' });
let n = 0; for (let i = 0; i < 30 && !n; i++) { await sleep(500); n = await received(); }
check(n === 1, `+4 日でも、本物の種が届く（${n}）`);
const u = await user();
check(u.receivedDate?.stringValue === dk(today), `1 日の受け取り数は、本当の日付で数える（${u.receivedDate?.stringValue}）`);
console.log('errors', errs);
await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
