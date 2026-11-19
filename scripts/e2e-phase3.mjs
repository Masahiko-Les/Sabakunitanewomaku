// フェーズ3確認用：種を蒔く → seeds と worlds/{uid}/tiles に保存 → 再読み込み・localStorage 削除後も自分の世界に残る
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '..', 'screenshots');
await mkdir(OUT, { recursive: true });
const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const val = x => x == null ? undefined : 'integerValue' in x ? Number(x.integerValue) : 'booleanValue' in x ? x.booleanValue
  : 'stringValue' in x ? x.stringValue : 'nullValue' in x ? null : 'timestampValue' in x ? x.timestampValue
  : 'arrayValue' in x ? (x.arrayValue.values || []).map(val) : x;
const plain = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)]));
const getDocJSON = async path => { const r = await fetch(`${FS}/${path}`, { headers: OWNER }); return r.ok ? plain(await r.json()) : null; };
const listDocs = async path => { const r = await (await fetch(`${FS}/${path}`, { headers: OWNER })).json();
  return (r.documents || []).map(d => ({ id: d.name.split('/').pop(), ...plain(d) })); };

// まっさらな Emulator から始める（ほかのテストの種が配達されてこないように）
await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

const browser = await chromium.launch();
const ctx = await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });

const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const label = () => page.textContent('#btnPlant');
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(2500); };

// 講習を終えた状態のユーザーを用意（講習の流れはフェーズ2のテストで確認済み）
await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const uid = await uidOf();
await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny`, {
  method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true } } }),
});
await page.reload({ waitUntil: 'load' }); await boot();

// 村の東の緑のマス (52,50) まで歩く
await page.mouse.click(285, 309);
await page.waitForTimeout(3500);
check((await label()).includes('ここに種を蒔く'), `蒔けるマスに立った（${await label()}）`);

async function plant(h, f) {
  await page.click('#btnPlant');
  await page.fill('#tH', h); await page.fill('#tF', f);
  await page.click('#ok');
  await page.waitForTimeout(1500);
}
const H1 = '人と話すとき、言葉が詰まってしまう。', F1 = '最初のひと言を「あの」で始めると、少し楽になると気づいた。';
await plant(H1, F1);
await page.screenshot({ path: `${OUT}/p3_1_planted.png` });

let tiles = await listDocs(`worlds/${uid}/tiles`);
check(tiles.length === 1 && tiles[0].kind === 'own' && tiles[0].x === 52 && tiles[0].y === 50, `タイルが保存された ${JSON.stringify(tiles)}`);
let seed = tiles[0] && await getDocJSON(`seeds/${tiles[0].seedId}`);
check(seed && seed.ownerUid === uid && seed.h === H1 && seed.f === F1 && seed.status === 'public' && seed.open === true
  && seed.deliveredCount === 0 && seed.deliveredTo.length === 0 && seed.flower >= 0 && seed.flower <= 4 && seed.createdAt,
  `種が保存された ${JSON.stringify(seed)}`);

// 再読み込み・localStorage 削除後も残る
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' }); await boot();
await page.click('#btnMine'); await page.waitForTimeout(600);
check((await page.textContent('#sheetBody')).includes(H1), 'localStorage を消して再読み込みしても「わたしの種」にある');
await page.screenshot({ path: `${OUT}/p3_2_mine_after_reload.png` });
await page.evaluate(() => document.querySelector('.scrim').click()); await page.waitForTimeout(400);

// 蒔いた種のマスをタップすると、その種のシートが開く（種のマスには立てない＝同じマスには蒔けない）
await page.mouse.click(285, 309); await page.waitForTimeout(2500);
check((await page.textContent('#sheetBody')).includes(H1) && (await page.textContent('#sheetBody')).includes('あなたの種'),
  '蒔いた種のマスをタップすると「あなたの種」が開く');

// 危機的な言葉 → hidden で保存、相談先シート
await page.reload({ waitUntil: 'load' }); await boot();
await page.mouse.click(285, 213); await page.waitForTimeout(3500); // 初期位置から (52,48)
check((await label()).includes('ここに種を蒔く'), `となりの蒔けるマスに立った（${await label()}）`);
await plant('もう消えたいと思う日がある。', '夜は早く寝るようにしている。');
check((await page.textContent('#sheetBody')).includes('種を預かりました'), '相談先シートが出た');
await page.screenshot({ path: `${OUT}/p3_3_crisis.png` });
tiles = await listDocs(`worlds/${uid}/tiles`);
const hiddenTile = tiles.find(t => t.y !== 50);
seed = hiddenTile && await getDocJSON(`seeds/${hiddenTile.seedId}`);
check(seed && seed.status === 'hidden' && seed.open === false, `危機ワードの種は hidden・open=false で保存 ${seed && seed.status}`);

await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' }); await boot();
await page.click('#btnMine'); await page.waitForTimeout(600);
const mineText = await page.textContent('#sheetBody');
check(mineText.includes('見えない場所に置いてあります'), '再読み込み後も、自分の世界には hidden の種が残る');

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
