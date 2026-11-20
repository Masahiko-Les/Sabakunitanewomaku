// 種を蒔く：おばあちゃんとの会話（① → ② → 確認 → 種が落ちて風に運ばれる → ひと言）の確認
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { newContext } from './skip-opening.mjs';
import { PLANT_TALK } from '../src/talk/plant.js';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-sabaku/databases/(default)/documents', { method: 'DELETE' });
const browser = await chromium.launch();
const page = await (await newContext(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0); await page.waitForTimeout(3000); };
const bubs = () => page.$$eval('#talk .bub', bs => bs.map(b => ({ me: b.classList.contains('me'), t: b.textContent })));
const inputs = () => page.$$eval('#sheet textarea', ts => ts.filter(t => t.offsetParent).length);
const shot = n => page.screenshot({ path: `screenshots/plant_${n}.png` });

await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 });
const me = await uidOf();
await fetch(`${FS}/users/${me}?updateMask.fieldPaths=tutorial&updateMask.fieldPaths=introSeen&updateMask.fieldPaths=metGranny&updateMask.fieldPaths=dummies&updateMask.fieldPaths=sampleLetters`, {
  method: 'PATCH', headers: OWNER,
  body: JSON.stringify({ fields: { tutorial: { integerValue: 3 }, introSeen: { booleanValue: true }, metGranny: { booleanValue: true },
    dummies: { mapValue: { fields: { s0: { mapValue: { fields: { x: { integerValue: 0 }, y: { integerValue: 0 } } } } } } }, sampleLetters: { mapValue: { fields: { s0: { mapValue: { fields: { text: { stringValue: '練習の手紙' }, t: { integerValue: 1 }, thanked: { booleanValue: true } } } } } } } } }) });
await page.reload({ waitUntil: 'load' }); await boot();

let b;
// ── ① に危機的な言葉：おばあちゃんが相談先を出し、種は蒔かずに会話を終える
await page.mouse.click(285, 309); await page.waitForTimeout(3500);
const before = (await (await fetch(`${FS}/worlds/${me}/tiles`, { headers: OWNER })).json()).documents?.length || 0;
await page.click('#btnPlant');
await page.locator('#tIn').waitFor({ state: 'visible' });
await page.fill('#tIn', 'もう死にたい。'); await page.click('#pTalk');
await page.locator('#pClose').waitFor({ state: 'visible', timeout: 5000 });
b = await bubs();
const ct = await page.textContent('#talk');
check(b.some(x => x.t.startsWith('だからね、「死にたい」「消えてしまいたい」')) && ct.includes('0120-783-556') && b.some(x => x.t.includes('迷わず119番')) && b.some(x => x.t.startsWith('助けを求めるのは')),
  '① に危機ワード：おばあちゃんの言葉と相談先が出る');
check(!(await page.$('#pSkip')) && !(await page.$('#tIn')), '② の問いかけには進まない');
await shot('10_crisis');
await page.click('#pClose'); await page.waitForTimeout(800);
const after = (await (await fetch(`${FS}/worlds/${me}/tiles`, { headers: OWNER })).json()).documents?.length || 0;
check(after === before && !(await page.evaluate(() => document.querySelector('#sheet').classList.contains('on'))), '「閉じる」で終わり、種は蒔かれない');

// ── 1 つ目：② まで書く。途中で「もうすこし直す」（危機ワードのときと同じマスに立ったまま）
await page.click('#btnPlant');
await page.locator('#tIn').waitFor({ state: 'visible' });
b = await bubs();
check(b.length === 1 && b[0].t === PLANT_TALK.ask, 'ステップ1：おばあちゃんの問いかけ（全文を一度に）');
check(await inputs() === 1, 'ステップ1：入力欄は 1 つだけ');
check(await page.isDisabled('#pTalk'), '空欄では「話す」を押せない');
await shot('1_ask');
await page.fill('#tIn', '人前で話すとき、言葉が出てこない。');
check(!(await page.isDisabled('#pTalk')), '書くと「話す」を押せる');
await page.click('#pTalk');
await page.locator('#pSkip').waitFor({ state: 'visible' });
b = await bubs();
check(b[1].me && b[1].t === '人前で話すとき、言葉が出てこない。' && b[2].t === PLANT_TALK.how, 'ステップ2：自分の言葉 → おばあちゃん');
check(await inputs() === 1, 'ステップ2：入力欄は 1 つだけ');
check((await page.textContent('#pSkip')) === 'いまはいいや', '「いまはいいや」がある');
await page.fill('#tIn', 'ゆっくり話すようにしている。');
await shot('2_how');
await page.click('#pTalk');
await page.locator('#pPlant').waitFor({ state: 'visible' });
b = await bubs();
check(b.at(-1).t === PLANT_TALK.ready, 'ステップ3：「よし、いい種ができたねぇ。…」');
check(await inputs() === 0, 'ステップ3：入力欄はない');
let card = await page.textContent('#talk .preview');
check(card.includes('人前で話すとき') && card.includes('ゆっくり話す') && !card.includes('生きづらさ：'), 'プレビュー：本文だけ（見出しラベルなし）');
check(!!(await page.$('#talk .preview .psep')), 'プレビュー：② があるので区切りがある');
await shot('3_preview');

await page.click('#pEdit');
await page.locator('#tIn').waitFor({ state: 'visible' });
check((await page.inputValue('#tIn')) === '人前で話すとき、言葉が出てこない。', '「もうすこし直す」：ステップ1に、書いた内容が入って戻る');
await page.fill('#tIn', '人前で話すとき、言葉が出てこないことがある。'); await page.click('#pTalk');
await page.locator('#pSkip').waitFor({ state: 'visible' });
check((await page.inputValue('#tIn')) === 'ゆっくり話すようにしている。', '「もうすこし直す」：ステップ2にも、書いた内容が入っている');
await page.click('#pTalk');
await page.locator('#pPlant').waitFor({ state: 'visible' });
card = await page.textContent('#talk .preview');
check(card.includes('ことがある。'), '直した内容がプレビューに出る');

await page.click('#pPlant');
const t0 = Date.now();
await page.waitForTimeout(400);
check(!(await page.evaluate(() => document.querySelector('#sheet').classList.contains('on'))), '蒔くと、シートが閉じる');
await shot('4_fall');
const toastText = () => page.textContent('#toast');
const waitToast = async (txt, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await toastText()) === txt) return Date.now() - t0; await page.waitForTimeout(50); } return -1; };
const tStart = await waitToast(PLANT_TALK.gustStart, 4000);
check(tStart > 900 && tStart < 2500, `風が吹き始めて、トースト「${PLANT_TALK.gustStart}」（${tStart}ms）`);
await page.waitForTimeout(800); await shot('5_gust');
await page.waitForTimeout(900); await shot('6_fluff');
const tEnd = await waitToast(PLANT_TALK.gustEnd, 9000);
check(tEnd > 5500, `風がおさまり綿毛が出ていったら、トースト「${PLANT_TALK.gustEnd}」（${tEnd}ms）`);
await shot('6_end');
check(!(await page.evaluate(() => document.querySelector('#sheet').classList.contains('on'))), '演出のあいだも、シートは開かない（砂漠のまま）');
const tiles = ((await (await fetch(`${FS}/worlds/${me}/tiles`, { headers: OWNER })).json()).documents || []);
const id1 = tiles[0]?.name.split('/').pop();
const s1 = (await getRaw(`seeds/${id1}`))?.fields || {};
check(s1.h?.stringValue === '人前で話すとき、言葉が出てこないことがある。' && s1.f?.stringValue === 'ゆっくり話すようにしている。', 'Firestore：h と f が保存された');

const waitToast2 = async txt => { for (let i = 0; i < 200; i++) { if ((await page.textContent('#toast')) === txt) return; await page.waitForTimeout(50); } };
// ── 2 つ目：「いまはいいや」（再読み込みして、初期位置からとなりのマス (52,48) へ）
await page.reload({ waitUntil: 'load' }); await boot();
await page.mouse.click(285, 213); await page.waitForTimeout(3500);
await page.click('#btnPlant');
await page.locator('#tIn').waitFor({ state: 'visible' });
await page.fill('#tIn', '朝、起きるのがつらい。'); await page.click('#pTalk');
await page.locator('#pSkip').waitFor({ state: 'visible' });
await page.click('#pSkip');
await page.locator('#pPlant').waitFor({ state: 'visible' });
b = await bubs();
const i = b.findIndex(x => x.me && x.t === 'いまはいいや');
check(i > 0 && b[i + 1]?.t === PLANT_TALK.skipped && b[i + 2]?.t === PLANT_TALK.ready, '「いまはいいや」→「それでいいんだよ。」→ ステップ3');
check(!(await page.$('#talk .preview .psep')), 'プレビュー：② がないので区切りもない');
await shot('7_skip_preview');
await page.click('#pPlant');
await waitToast2(PLANT_TALK.gustEnd);
const tiles2 = ((await (await fetch(`${FS}/worlds/${me}/tiles`, { headers: OWNER })).json()).documents || []).map(d => d.name.split('/').pop());
const id2 = tiles2.find(x => x !== id1);
const s2 = (await getRaw(`seeds/${id2}`))?.fields || {};
check(s2.h?.stringValue === '朝、起きるのがつらい。' && 'nullValue' in (s2.f || {}), 'Firestore：② を書かなければ f は null');
await shot('8_map');

// ── わたしの種から開く：ラベルなし、② のないカードに区切りなし
await page.click('#btnMine'); await page.waitForTimeout(400);
await page.click(`[data-go="${id2}"]`); await page.waitForTimeout(1200);
const body = await page.textContent('#sheetBody');
check(body.includes('朝、起きるのがつらい。') && !body.includes('生きづらさ：') && !body.includes('どう向き合っているか：'), '自分の種のカード：ラベルなし');
check(!(await page.$('#sheetBody .parchment .psep')), '② のない種のカードには区切りがない');
await shot('9_card');

console.log('errors', errs);
await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
