// 設定（⚙）と「すべてのデータを消す」の確認
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
import { sowSeed } from './plant-talk.mjs';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };
const list = async p => ((await (await fetch(`${FS}/${p}`, { headers: OWNER })).json()).documents || []).map(d => d.name.split('/').pop());

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

const browser = await chromium.launch();
const page = await (await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(2500); };
const body = () => page.textContent('#sheetBody');
const sheetOn = () => page.evaluate(() => document.querySelector('#sheet').classList.contains('on'));
const openSettings = async () => { await page.click('#btnSet'); await page.waitForTimeout(500); };

// ほかのテストの種が届くと、タップした場所に種があったりするので、Emulator のデータを空にしてから始める
await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });
await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const uid = await uidOf();
await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies`, {
  method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true }, dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 0 }, y: { integerValue: 0 } } } } } } } } }) });
await page.reload({ waitUntil: 'load' }); await boot();

// ── 右上は ⚙ だけ
check(await page.$('#btnSky') === null && await page.$('#btnHelp') === null && !!(await page.$('#btnSet svg')), '右上は ⚙（線の歯車）だけ');
await page.screenshot({ path: 'screenshots/set_0_header.png', clip: { x: 0, y: 0, width: 390, height: 90 } });

// ── 設定画面
await openSettings();
let t = await body();
for (const w of ['設定', 'この世界について', '昼と夜', '時刻に合わせる', '困ったときの相談先', 'データについて', 'すべてのデータを消す', '利用規約', 'プライバシーポリシー', 'お問い合わせ'])
  check(t.includes(w), `設定に「${w}」がある`);
await page.screenshot({ path: 'screenshots/set_1_settings.png' });
await page.evaluate(() => document.querySelector('#sheet').scrollTo(0, 9999)); await page.waitForTimeout(300);
await page.screenshot({ path: 'screenshots/set_1b_settings_bottom.png' });

// 昼と夜：「夜」を選ぶと夜になり、再読み込みしても覚えている
await page.click('[data-sky="night"]'); await page.click('#x'); await page.waitForTimeout(2500);
check(await page.evaluate(() => document.body.classList.contains('night')), '「夜」を選ぶと夜になる');
await page.reload({ waitUntil: 'load' }); await boot();
check(await page.evaluate(() => document.body.classList.contains('night')), '再読み込みしても夜のまま');
await page.screenshot({ path: 'screenshots/set_2_night.png' });
await openSettings();
check(await page.evaluate(() => document.querySelector('[data-sky="night"]').classList.contains('on')), '設定を開くと「夜」が選ばれている');
await page.click('[data-sky="day"]'); await page.click('#x'); await page.waitForTimeout(2500);
check(!(await page.evaluate(() => document.body.classList.contains('night'))), '「昼」を選ぶと昼になる');

// この世界について・相談先
await openSettings(); await page.click('#sHelp'); await page.waitForTimeout(500);
check((await body()).includes('この世界について') && (await body()).includes('歩きはじめる'), '「この世界について」で説明シートが開く');
await page.click('#x'); await page.waitForTimeout(400);
await openSettings(); await page.click('#sCare'); await page.waitForTimeout(500);
t = await body();
check(t.includes('困ったときの相談先') && t.includes('0120-061-338') && t.includes('まもろうよ こころ'), '「困ったときの相談先」で相談先一覧が開く');
await page.screenshot({ path: 'screenshots/set_3_care.png' });
await page.click('#x'); await page.waitForTimeout(400);
check(!(await sheetOn()), '閉じるで閉じる');

// 利用規約などのページ
for (const [href, title] of [['/terms.html', '利用規約'], ['/privacy.html', 'プライバシーポリシー'], ['/contact.html', 'お問い合わせ']]) {
  const r = await fetch(URL + href); check(r.ok && (await r.text()).includes(`<h1>${title}</h1>`), `${href} が開ける`);
}
const lp = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
for (const n of ['terms', 'privacy', 'contact']) { await lp.goto(`${URL}/${n}.html`, { waitUntil: 'load' }); await lp.waitForTimeout(500); await lp.screenshot({ path: `screenshots/set_page_${n}.png` }); }
await lp.close();

// ── すべてのデータを消す
await page.mouse.click(285, 309); await page.waitForTimeout(3500);
await sowSeed(page, '消す前の種です。', 'あとで消える世界に蒔いた。'); await page.waitForTimeout(500);
// ほかのテストの種が届いていることもあるので、自分の種（kind: own）だけを数える
const tiles = [];
for (const id of await list(`worlds/${uid}/tiles`)) if ((await getRaw(`worlds/${uid}/tiles/${id}`))?.fields?.kind?.stringValue === 'own') tiles.push(id);
check(tiles.length === 1, '消す前：自分の世界に自分の種が 1 つ');
const seedId = tiles[0];

await openSettings();
await page.click('#rst'); await page.waitForTimeout(300);
check((await page.textContent('#rst')) === '本当に消す', '1 回押すと「本当に消す」になる');
check(!!(await getRaw(`users/${uid}`)), 'まだ消えていない');
await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#rst')]);
await boot();
const uid2 = await uidOf();
check(uid2 && uid2 !== uid, `新しい匿名アカウントで始まった（${uid} → ${uid2}）`);
check(!(await sheetOn()), '説明シートは出ない（試作版と同じ）');
check((await page.textContent('#toast')).includes('世界をはじめの姿に戻しました'), 'トースト「世界をはじめの姿に戻しました」');
await page.screenshot({ path: 'screenshots/set_4_after_reset.png' });
check(!(await getRaw(`users/${uid}`)), '前の users/{uid} は消えた');
check((await list(`worlds/${uid}/tiles`)).length === 0, '前の世界のタイルは消えた');
check(!!(await getRaw(`seeds/${seedId}`)), '蒔いた種そのものは残る（ほかの人の世界は変えない）');
const u2 = (await getRaw(`users/${uid2}`))?.fields || {};
check(Number(u2.tutorial?.integerValue) === 0 && u2.introSeen?.booleanValue === true, '新しい記録：講習は最初から、説明は見た扱い');
check((await page.textContent('#btnPlant')).includes('おばあちゃんと話そう'), '講習が最初から（「おばあちゃんと話そう」）');
await page.click('#btnMine'); await page.waitForTimeout(500);
check(!(await body()).includes('消す前の種です。'), '「わたしの種」に前の種はない');
const authUsers = await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-sabaku/accounts', { headers: OWNER })).json().catch(() => null);
if (authUsers?.userInfo) check(!authUsers.userInfo.some(u => u.localId === uid), '前の匿名アカウントは削除された');

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
