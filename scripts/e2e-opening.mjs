// オープニングの確認（INTEGRATION.md の完了チェック）
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';

const URL = 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const getRaw = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? (await r.json()) : null; };

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARRIVAL = ['おや……。', 'お空から落ちてきたんかい。\nここに来る人は、みんなそうさ。', 'ここは、生きづらさの砂漠。\nひとりで歩くには、ちょいと風が強すぎる所でね。'];
const LAST = 'まずは火にあたって、あったまりな。\n種の蒔き方は、それから教えてあげようね。';
const TUT_FIRST = 'おや、はじめて見る顔だねぇ。よく来たね。まあ、火にあたっていきな。';
const GIRL_END = 'この下にはね、何かを抱えた人たちが\nひとりずつ、種を蒔いている場所があるの。';
const CASES = {
  '吃音': { girl: ['「吃音」……うん。', 'ずっと、ひとりで抱えてきたんだね。'], gran: '吃音のことを、抱えてきたんだねぇ。\n……よう、ここまで来た。' },
  'その他': { girl: ['うん。\n名前のない苦しさも、ちゃんと苦しさだよ。'], gran: 'あんたにしか分からん苦労を、\n抱えてきたんだねぇ。' },
  'none': { girl: ['うん。\n言葉にならなくても、いいよ。'], gran: '言葉にならんもんを、抱えてきたんだねぇ。\nそれで、ええんよ。' },
};

const browser = await chromium.launch();

async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  return { ctx, page };
}
const uidOf = page => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const has = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
const vt = page => page.evaluate(() => document.querySelector('#opening #vt')?.textContent ?? null);
const tapStage = page => page.mouse.click(30, 120);

// 女の子の台詞を、▼ が出るたびに読み取って進める。until() が true になるまで
async function readGirl(page, until, ms = 60000) {
  const lines = []; const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await until()) return lines;
    if (await page.evaluate(() => document.querySelector('#opening #vnext')?.classList.contains('on'))) { lines.push(await vt(page)); await tapStage(page); }
    await sleep(120);
  }
  throw new Error('女の子の台詞が進まない');
}
// おばあちゃんの会話シートを「つぎへ」で進め、吹き出しを集める
async function readGranny(page) {
  await page.locator('#sheet.on').waitFor({ timeout: 10000 });
  for (let i = 0; i < 30; i++) { const nx = await page.$('#nx'); if (!nx) break; await nx.click(); await sleep(150); }
  await page.locator('#bt').waitFor({ timeout: 5000 });
  return page.$$eval('#talk .bub', bs => bs.map(b => b.textContent));
}
const rect = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; }, sel);
const hit = (a, b) => a.t < b.b && b.t < a.b && a.l < b.r && b.l < a.r;

/** 最初から最後まで（選ぶ → タイトルでタップ → 着地 → おばあちゃん → 講習） */
async function fullRun(choice, w, h, shots) {
  const { ctx, page } = await open(w, h);
  check(await has(page, '#opening'), `[${choice} ${w}×${h}] はじめて開くとオープニングが出る`);
  await page.locator('#opening #voice:not(.hide)').waitFor({ timeout: 15000 });
  const intro = await readGirl(page, () => page.evaluate(() => document.querySelector('#opening #chips').classList.contains('on')));
  check(JSON.stringify(intro) === JSON.stringify(['ここは、暗闇……', '何もない、孤独な場所……']), `[${choice}] 女の子の最初の台詞 ${JSON.stringify(intro)}`);
  await sleep(1500);
  check((await vt(page)) === 'あなたが抱える\n生きづらさは、ありますか？', `[${choice}] 問いの文言（改行も）`);
  const chips = await page.$$eval('#opening .chip', bs => bs.map(b => b.textContent));
  check(JSON.stringify(chips) === JSON.stringify(['吃音', 'うつ', '不安・パニック', '摂食障害', '発達の特性', '介護', '子育て', '不登校・ひきこもり', '仕事', '人間関係', 'その他', 'まだ、言葉にできない']), `[${choice}] 選択肢`);
  const rv = await rect(page, '#opening #vt'), rc = await rect(page, '#opening #chips'), rg = await rect(page, '#opening #girl');
  check(!hit(rv, rc) && !hit(rv, rg) && !hit(rg, rc) && rg.t >= 0, `[${choice} ${w}×${h}] 文字・選択肢・女の子が重ならない（文字 ${rv.t|0}-${rv.b|0}／選択肢 ${rc.t|0}-／女の子 ${rg.t|0}-${rg.b|0}）`);
  if (shots) await page.screenshot({ path: `screenshots/op_${w}x${h}_1_question.png` });
  await page.click(`#opening .chip[data-val="${choice}"]`);
  const reply = await readGirl(page, () => page.evaluate(() => document.querySelector('#opening #title')?.classList.contains('on')));
  check(JSON.stringify(reply) === JSON.stringify([...CASES[choice].girl, GIRL_END]), `[${choice}] 女の子の返事 ${JSON.stringify(reply)}`);
  check((await page.evaluate(() => localStorage.getItem('sabaku.interest'))) === choice, `[${choice}] localStorage に関心テーマ`);
  await page.locator('#opening #tapHint.on').waitFor({ timeout: 5000 });
  if (shots) await page.screenshot({ path: `screenshots/op_${w}x${h}_2_title.png` });
  await sleep(4000);
  check(await has(page, '#opening #title.on') && !(await has(page, '#opening.landed')), `[${choice}] タイトルでは、タップするまで落下が続く`);
  await tapStage(page);
  await sleep(3400 + 300);
  check(await has(page, '#opening.landed'), `[${choice}] タップから 3.4 秒で着地`);
  if (shots) await page.screenshot({ path: `screenshots/op_${w}x${h}_3_flash.png` });
  await page.waitForFunction(() => !document.querySelector('#opening'), null, { timeout: 4000 });
  check(await page.evaluate(() => document.body.classList.contains('night')), `[${choice}] 着地のあと、地図は夜`);
  const bubs = await readGranny(page);
  if (shots) await page.screenshot({ path: `screenshots/op_${w}x${h}_4_granny.png` });
  check(JSON.stringify(bubs.slice(0, 5)) === JSON.stringify([...ARRIVAL, CASES[choice].gran, LAST]) && bubs[5] === TUT_FIRST,
    `[${choice}] おばあちゃん：到着のことば → 初回講習（${bubs.length} 吹き出し）`);
  check((await page.textContent('#bt')) === 'おばあちゃんの種を見にいく', `[${choice}] 最後は「おばあちゃんの種を見にいく」`);
  const uid = await uidOf(page);
  const f = (await getRaw(`users/${uid}`))?.fields || {};
  check(f.interest?.stringValue === choice && f.openingSeen?.booleanValue === true, `[${choice}] users に interest="${choice}"・openingSeen`);
  return { ctx, page, uid };
}

/** スキップ：at の場面で押す */
async function skipRun(at) {
  const { ctx, page } = await open(390, 844);
  await page.locator('#opening #voice:not(.hide)').waitFor({ timeout: 15000 });
  let choice = null;
  if (at === 'chips' || at === 'title') await readGirl(page, () => page.evaluate(() => document.querySelector('#opening #chips').classList.contains('on')));
  if (at === 'title') {
    await sleep(1200); await page.click('#opening .chip[data-val="仕事"]'); choice = '仕事';
    await readGirl(page, () => page.evaluate(() => document.querySelector('#opening #title')?.classList.contains('on')));
  }
  if (at === 'dark') await sleep(300);
  await page.click('#opening #skip');
  await sleep(300);
  check(await has(page, '#opening.landed'), `[スキップ：${at}] すぐ着地の閃光へ`);
  await page.waitForFunction(() => !document.querySelector('#opening'), null, { timeout: 4000 });
  const bubs = await readGranny(page);
  const expect = choice ? [...ARRIVAL, `${choice}のことを、抱えてきたんだねぇ。\n……よう、ここまで来た。`, LAST, TUT_FIRST] : [...ARRIVAL, LAST, TUT_FIRST];
  check(JSON.stringify(bubs.slice(0, expect.length)) === JSON.stringify(expect), `[スキップ：${at}] おばあちゃんの台詞 ${JSON.stringify(bubs.slice(0, expect.length))}`);
  const f = (await getRaw(`users/${await uidOf(page)}`))?.fields || {};
  check(choice ? f.interest?.stringValue === choice : ('nullValue' in (f.interest || {})), `[スキップ：${at}] interest は ${choice ?? 'null'}`);
  await ctx.close();
}

// ── 通常（390×844）：最後まで → 再読み込みで出ない → 講習が続く
{
  const { ctx, page } = await fullRun('吃音', 390, 844, true);
  await page.click('#bt'); await sleep(3500);
  check((await page.textContent('#btnPlant')).includes('おばあちゃんの種に水やり'), '講習に進んだ（「おばあちゃんの種に水やり」）');
  await page.reload({ waitUntil: 'load' }); await sleep(3000);
  check(!(await has(page, '#opening')) && !(await page.evaluate(() => document.querySelector('#sheet').classList.contains('on'))), '2 回目は、オープニングも説明シートも出ない');
  check((await page.textContent('#btnPlant')).includes('おばあちゃんの種に水やり'), '再読み込みしても講習の続き');
  // 開発用：?opening=1 で、もう一度見られる
  await page.goto(URL + '/?opening=1', { waitUntil: 'load' });
  await page.locator('#opening #voice:not(.hide)').waitFor({ timeout: 15000 });
  check(true, '?opening=1 で、もう一度オープニングが出る');
  await page.click('#opening #skip'); await page.waitForFunction(() => !document.querySelector('#opening'), null, { timeout: 4000 });
  await page.locator('#sheet.on').waitFor({ timeout: 5000 });
  for (let i = 0; i < 10; i++) { const nx = await page.$('#nx'); if (!nx) break; await nx.click(); await sleep(150); }
  await page.locator('#bt').waitFor({ timeout: 5000 });
  check((await page.textContent('#bt')) === 'はじめる', '講習を始めている人が見直したときは、到着のことばのあと「はじめる」で閉じる');
  await ctx.close();
}
// ── その他・まだ、言葉にできない（375×570 の短い画面も）
await (await fullRun('その他', 375, 570, true)).ctx.close();
await (await fullRun('none', 390, 844, false)).ctx.close();
// ── スキップ（どの場面でも）
for (const at of ['dark', 'chips', 'title']) await skipRun(at);

// ── 試作のスクショ（並べて見比べる用）
for (const [w, h] of [[390, 844], [375, 570]]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })).newPage();
  await p.goto('file://' + process.cwd() + '/opening-prototype.html', { waitUntil: 'load' });
  await p.locator('#voice:not(.hide)').waitFor({ timeout: 15000 });
  for (let i = 0; i < 40 && !(await p.evaluate(() => document.querySelector('#chips').classList.contains('on'))); i++) {
    if (await p.evaluate(() => document.querySelector('#vnext').classList.contains('on'))) await p.mouse.click(30, 120);
    await sleep(150);
  }
  await sleep(1500); await p.screenshot({ path: `screenshots/op_proto_${w}x${h}_1_question.png` });
  await p.close();
}

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
