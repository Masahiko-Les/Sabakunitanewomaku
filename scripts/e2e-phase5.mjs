// フェーズ5確認用：水やり（手紙）→ ありがとう → 両方の世界で花、未読の点
// A が蒔き、B の世界に届いた種に B が手紙を書き、A がありがとうを返す。どちらも再読み込みなしで届くか。
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
import { sowSeed } from './plant-talk.mjs';

const URL = 'http://localhost:5173';
const BASE = 'http://127.0.0.1:8080';
const FS = `${BASE}/v1/projects/demo-sabaku/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const TILE = 48, VC = { x: 50 * TILE, y: 49.6 * TILE }, W = 390, H = 780;

const val = x => x == null ? undefined : 'integerValue' in x ? Number(x.integerValue) : 'booleanValue' in x ? x.booleanValue
  : 'stringValue' in x ? x.stringValue : 'nullValue' in x ? null : 'timestampValue' in x ? x.timestampValue
  : 'arrayValue' in x ? (x.arrayValue.values || []).map(val) : x;
const plain = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)]));
const getJSON = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? plain(await r.json()) : null; };
const list = async p => ((await (await fetch(`${FS}/${p}`, { headers: OWNER })).json()).documents || [])
  .map(d => ({ id: d.name.split('/').pop(), ...plain(d) }));

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

await fetch(`${BASE}/emulator/v1/projects/demo-sabaku/databases/(default)/documents`, { method: 'DELETE' });

const browser = await chromium.launch();
async function player(name) {
  const page = await (await newContext(browser, { viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
  page.on('console', m => { if (m.type() === 'error') console.log(`[${name} console]`, m.text()); });
  page.on('pageerror', e => console.log(`[${name} pageerror]`, e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.locator('#sheet.on').waitFor({ timeout: 15000 });
  const uid = await page.evaluate(() => new Promise(res => {
    const req = indexedDB.open('firebaseLocalStorageDb');
    req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
      a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  }));
  await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies&updateMask.fieldPaths=sampleLetters`, {
    method: 'PATCH', headers: OWNER,
    body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true }, dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 0 }, y: { integerValue: 0 } } } } } } }, sampleLetters: { mapValue: { fields: { s0: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } } } } } } }) });
  const p = { page, uid, name, P: null };
  await reload(p);
  return p;
}
async function reload(p) {
  await p.page.reload({ waitUntil: 'load' });
  await p.page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0);
  await p.page.waitForTimeout(2500);
  p.P = { x: VC.x + 30, y: VC.y + 85 }; // 起動時の立ち位置
}
// 種のあるマス：見本の種 8 つ、おばあちゃんの種、その人の世界の種
const SAMPLE_XY = [[-4,-1],[3,-2],[-3,2],[2,2],[0,3],[-1,-4],[-4,-3],[3,0]].map(([dx, dy]) => `${50 + dx},${50 + dy}`);
const occupied = async p => new Set([...SAMPLE_XY, '47,50', ...(await list(`worlds/${p.uid}/tiles`)).map(t => `${t.x},${t.y}`)]);
const cam = P => ({ x: P.x - W / 2, y: P.y - H * .45 });
// 種を開く。まっすぐ歩くと家や茂みに引っかかることがあるので、だめなら村の外側を回る道を試す
async function openSeedAt(p, tx, ty) {
  const routes = [[], [[45, 52], [45, ty]], [[55, 52], [55, ty]], [[50, 55], [tx, 55]]];
  for (const route of routes) {
    for (const [wx, wy] of route) await walkTo(p, wx, wy, true);
    await walkTo(p, tx, ty, false);
    try { await p.page.locator('#tL').waitFor({ state: 'visible', timeout: 8000 }); return; } catch {}
    if (await p.page.evaluate(() => document.querySelector('#sheet').classList.contains('on'))) await closeSheet(p);
    await reload(p);
  }
  throw new Error('種まで歩けなかった');
}
// 画面の外のマスにも、何歩かに分けて近づいてから、そのマスをタップする（種なら、近づくと自動でシートが開く）
async function walkTo(p, tx, ty, settle) {
  const wx = (tx + .5) * TILE, wy = (ty + .5) * TILE;
  for (let step = 0; step < 6; step++) {
    const c = cam(p.P), sx = wx - c.x, sy = wy - c.y;
    if (sx > 20 && sx < W - 20 && sy > 110 && sy < H - 120) {
      await p.page.mouse.click(sx, sy);
      if (settle) { await p.page.waitForTimeout(2500); p.P = { x: wx, y: wy - 10 }; }
      return;
    }
    let cx = Math.max(40, Math.min(W - 40, sx)), cy = Math.max(130, Math.min(H - 140, sy));
    // 途中でタップするマスに種があると、そのシートが開いてしまうので、画面の中央寄りにずらす
    const busy = await occupied(p);
    for (let k = 0; k < 6 && busy.has(`${Math.floor((cx + c.x) / TILE)},${Math.floor((cy + c.y) / TILE)}`); k++) {
      cx += Math.sign(W / 2 - cx) * TILE; cy += Math.sign(H / 2 - cy) * TILE * .5;
    }
    const ttx = Math.floor((cx + c.x) / TILE), tty = Math.floor((cy + c.y) / TILE);
    await p.page.mouse.click(cx, cy); await p.page.waitForTimeout(2500);
    p.P = { x: (ttx + .5) * TILE, y: (tty + .5) * TILE - 10 };
  }
  throw new Error('種まで歩けなかった');
}
const dotOn = p => p.page.evaluate(() => document.querySelector('#dot').style.display !== 'none');
const sheetText = p => p.page.textContent('#sheetBody');
const closeSheet = async p => { await p.page.evaluate(() => document.querySelector('.scrim').click()); await p.page.waitForTimeout(400); };
async function waitFor(fn, ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 300)); } return false; }

// ── A が種を蒔く
const A = await player('A');
await A.page.mouse.click(285, 309); await A.page.waitForTimeout(3500);
const H1 = '人と話すとき、言葉が詰まってしまう。';
await sowSeed(A.page, H1, '最初のひと言を「あの」で始めている。');
const seedId = (await list(`worlds/${A.uid}/tiles`))[0].seedId;

// ── B の世界に届く → B が手紙を書く
const B = await player('B');
let bt; for (let i = 0; i < 30 && !bt; i++) { bt = (await list(`worlds/${B.uid}/tiles`)).find(t => t.seedId === seedId); if (!bt) await new Promise(r => setTimeout(r, 500)); } // 配達は講習後の再読み込みから
check(!!bt, `B の世界に A の種が届いた（${bt?.x},${bt?.y}）`);
await openSeedAt(B, bt.x, bt.y);
check((await sheetText(B)).includes(H1) && (await sheetText(B)).includes('誰かの種'), 'B が A の種を開いた');
const LETTER = '「あの」で始める工夫、すてきです。';
await B.page.fill('#tL', LETTER); await B.page.click('#ok'); await B.page.waitForTimeout(1200);
const l = await getJSON(`seeds/${seedId}/letters/${B.uid}`);
check(l && l.text === LETTER && l.writerUid === B.uid && l.thanked === false, '手紙が seeds/{id}/letters/{B} に保存された');

// ── A：再読み込みなしで手紙が届き、点がつく
check(await waitFor(() => dotOn(A)), 'A：再読み込みなしで未読の点がついた');
await A.page.screenshot({ path: 'screenshots/p5_1_A_letter_arrived.png' });
await A.page.click('#btnMine'); await A.page.waitForTimeout(500);
check((await sheetText(A)).includes('手紙 1通'), 'A：「わたしの種」に「手紙 1通」');
await A.page.click('[data-go]'); await A.page.waitForTimeout(1200);
check((await sheetText(A)).includes(LETTER) && (await sheetText(A)).includes('誰かからの手紙'), 'A：B の手紙が読める');
await A.page.screenshot({ path: 'screenshots/p5_2_A_reading.png' });
await A.page.click('[data-thx]'); await A.page.waitForTimeout(2500);
check((await getJSON(`seeds/${seedId}/letters/${B.uid}`)).thanked === true, 'A がありがとうを返した（Firestore）');
check(!(await dotOn(A)), 'A：読んだので点は消えた');
await A.page.screenshot({ path: 'screenshots/p5_3_A_bloom.png' });

// ── B：再読み込みなしで、ありがとうが返り、花が咲き、点がつく
check(await waitFor(() => dotOn(B)), 'B：再読み込みなしで未読の点がついた');
await B.page.waitForTimeout(1500);
await B.page.screenshot({ path: 'screenshots/p5_4_B_bloom.png' });
await B.page.click('#btnMine'); await B.page.waitForTimeout(500);
check((await sheetText(B)).includes('ありがとうが返ってきました'), 'B：「ありがとうが返ってきました」');
await closeSheet(B);

// ── 再読み込み・localStorage 削除後も、状態と未読が正しい
await B.page.evaluate(() => localStorage.clear()); await reload(B);
check(await dotOn(B), 'B：再読み込み後も、まだ見ていないので点がある');
await B.page.click('#btnMine'); await B.page.waitForTimeout(500);
await B.page.click('[data-go]'); await B.page.waitForTimeout(1200);
check((await sheetText(B)).includes('ありがとうが返ってきて、花がひとつ咲きました。'), 'B：種のシートに「ありがとうが返ってきて…」');
await closeSheet(B);
await B.page.evaluate(() => localStorage.clear()); await reload(B);
check(!(await dotOn(B)), 'B：一度見たら、localStorage を消して再読み込みしても点は出ない');

await A.page.evaluate(() => localStorage.clear()); await reload(A);
check(!(await dotOn(A)), 'A：再読み込み後も点は出ない');
await A.page.click('#btnMine'); await A.page.waitForTimeout(500);
check((await sheetText(A)).includes('花が咲いています'), 'A：再読み込み後も、自分の種は花が咲いている');
await A.page.click('[data-go]'); await A.page.waitForTimeout(1200);
check((await sheetText(A)).includes('ありがとうを返しました'), 'A：ありがとうは取り消せない（「ありがとうを返しました」）');

// ── A：自分の種には、自分で手紙を書けない（「自分に、手紙を書く」は廃止）
check(!(await A.page.$('#selfBtn')) && !(await sheetText(A)).includes('自分に、手紙を書く'), 'A：自分の種に「自分に、手紙を書く」はない');
await closeSheet(A);

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
