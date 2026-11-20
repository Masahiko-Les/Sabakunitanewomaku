// 開発用「次の日にする」の確認：練習の種に今日書いた手紙に、次の日にするとありがとうが返る
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };
const b = await chromium.launch();
const page = await (await newContext(b, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5173', { waitUntil: 'load' }); await page.locator('#sheet.on').waitFor();
const me = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('firebaseLocalStorageDb'); r.onsuccess = () => { const a = r.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll(); a.onsuccess = () => res(a.result.find(x => x.value?.uid)?.value.uid); }; }));
const thanked = async () => (await (await fetch(`${FS}/users/${me}`, { headers: OWNER })).json()).fields?.sampleLetters?.mapValue?.fields?.s1?.mapValue?.fields?.thanked?.booleanValue;
await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies&updateMask.fieldPaths=sampleLetters`, {
  method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true },
    dummies: { mapValue: { fields: { s1: { mapValue: { fields: { x: { integerValue: 52 }, y: { integerValue: 50 } } } } } } },
    sampleLetters: { mapValue: { fields: { s1: { mapValue: { fields: { text: { stringValue: '今日の手紙' }, t: { integerValue: Date.now() }, thanked: { booleanValue: false } } } } } } } } }) });
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000);
check((await thanked()) === false, '今日書いた練習の種への手紙には、まだありがとうが返らない');
await page.click('#btnSet'); await page.waitForTimeout(500);
const label = await page.textContent('#sNextDay');
check(label === '次の日にする（開発用・いま +0 日）', `設定に「次の日にする」（${label}）`);
await page.screenshot({ path: 'screenshots/nextday_1_settings.png' });
await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#sNextDay')]);
await page.waitForTimeout(3500);
check((await thanked()) === true, '次の日にすると、練習の種にありがとうが返る');
await page.click('#btnSet'); await page.waitForTimeout(500);
check((await page.textContent('#sNextDay')).includes('+1 日'), '設定の表示が +1 日になる');
await page.screenshot({ path: 'screenshots/nextday_2_after.png' });
console.log('errors', errs);
await b.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
