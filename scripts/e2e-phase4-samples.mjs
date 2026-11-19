// 見本の種への手紙：どこにも届かず、翌日に「ありがとう」が返って花が咲く
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true・VITE_USE_SAMPLES=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const userDoc = async uid => (await (await fetch(`${FS}/users/${uid}`, { headers: OWNER })).json()).fields || {};
const patch = (uid, mask, fields) => fetch(`${FS}/users/${uid}?${mask.map(m => 'updateMask.fieldPaths=' + m).join('&')}`,
  { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

const browser = await chromium.launch();
const page = await (await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
}));
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(2500); };
const dotOn = () => page.evaluate(() => document.querySelector('#dot').style.display !== 'none');

await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const uid = await uidOf();
await patch(uid, ['tutorial', 'introSeen', 'metGranny'],
  { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true } });
await page.reload({ waitUntil: 'load' }); await boot();

// 見本の種 s3（村の南東 52,52）まで歩いて、手紙を書く
await page.mouse.click(285, 405);
await page.locator('#tL').waitFor({ state: 'visible', timeout: 15000 });
check((await page.textContent('#sheetBody')).includes('家族の介護で'), '見本の種 s3 が開いた');
const TEXT = '小さなごほうび、すてきです。';
await page.fill('#tL', TEXT); await page.click('#ok'); await page.waitForTimeout(1200);
let f = await userDoc(uid);
const l = f.sampleLetters?.mapValue?.fields?.s3?.mapValue?.fields;
check(l && l.text.stringValue === TEXT && l.thanked.booleanValue === false, '手紙は users/{uid}.sampleLetters に残る（ほかの人には届かない）');

// 同じ日のうちは、ありがとうは返らない
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' }); await boot();
check(!(await dotOn()), '同じ日：未読の点はつかない');
await page.click('#btnMine'); await page.waitForTimeout(500);
let t = await page.textContent('#sheetBody');
check(t.includes('家族の介護で') && !t.includes('ありがとうが返ってきました'), '同じ日：「水をあげた種」にあり、まだありがとうはない（localStorage を消しても残る）');
await page.evaluate(() => document.querySelector('.scrim').click()); await page.waitForTimeout(400);

// 手紙を「昨日」書いたことにする → 再読み込みで、ありがとうが返り花が咲く
const yesterday = Date.now() - 86400000;
await patch(uid, ['sampleLetters.s3.t'], { sampleLetters: { mapValue: { fields: { s3: { mapValue: { fields: { t: { integerValue: String(yesterday) } } } } } } } });
await page.reload({ waitUntil: 'load' }); await boot();
await page.waitForTimeout(1500);
check(await dotOn(), '翌日：未読の点がつく');
await page.screenshot({ path: 'screenshots/p4_sample_bloom.png' });
f = await userDoc(uid);
check(f.sampleLetters.mapValue.fields.s3.mapValue.fields.thanked.booleanValue === true, '翌日：ありがとうが記録された');
await page.click('#btnMine'); await page.waitForTimeout(500);
t = await page.textContent('#sheetBody');
check(t.includes('ありがとうが返ってきました'), '翌日：「ありがとうが返ってきました」');

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
