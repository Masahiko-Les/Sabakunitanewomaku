// フェーズ2確認用：匿名ログイン → users/{uid} 作成 → 講習の進み具合が再読み込み後も続きから再開できるか
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '..', 'screenshots');
await mkdir(OUT, { recursive: true });
const URL = 'http://localhost:5173';
const PROJECT = 'demo-sabaku';

async function userDoc(uid) {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return null;
  const f = (await r.json()).fields || {};
  const v = x => x == null ? undefined : ('integerValue' in x ? Number(x.integerValue) : 'booleanValue' in x ? x.booleanValue
    : 'stringValue' in x ? x.stringValue : 'nullValue' in x ? null : 'timestampValue' in x ? x.timestampValue : x);
  return Object.fromEntries(Object.entries(f).map(([k, x]) => [k, v(x)]));
}
const fail = m => { console.error('NG:', m); process.exitCode = 1; };
const check = (cond, m) => cond ? console.log('OK:', m) : fail(m);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });

const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => {
    const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
    const all = tx.objectStore('firebaseLocalStorage').getAll();
    all.onsuccess = () => res(all.result.find(r => r.value?.uid)?.value.uid || null);
  };
  req.onerror = () => res(null);
}));
const sheetOn = () => page.evaluate(() => document.querySelector('#sheet')?.classList.contains('on'));
// 会話は「つぎへ」で進む。目的のボタンが出るまで押し続ける
const waitText = async (t, timeout = 60000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.getByText(t, { exact: true }).first().isVisible()) return;
    const next = page.locator('#sheetBody button', { hasText: 'つぎへ' }).first();
    if (await next.isVisible()) await next.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  throw new Error('timeout waiting for ' + t);
};
const tapGranny = async () => {
  // 初期位置のカメラで、おばあちゃんは画面の (115, 268) あたり
  await page.mouse.click(115, 268);
};

// 1. 初回：匿名ログイン、users/{uid} が作られ、説明シートが出る
await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 15000 }).catch(() => {});
await page.waitForTimeout(600);
const uid = await uidOf();
check(!!uid, `匿名ログインできた uid=${uid}`);
let d = await userDoc(uid);
check(d && d.tutorial === 0 && d.introSeen === false && d.metGranny === false && d.grannyLetter === null && d.createdAt,
  `users/{uid} が初期値で作られた ${JSON.stringify(d)}`);
check(await sheetOn(), '初回は説明シートが出る');
await page.screenshot({ path: `${OUT}/p2_1_help.png` });

// 2. 歩きはじめる → introSeen=true、再読み込みで説明シートが出ない
await page.click('#x');
await page.waitForTimeout(800);
d = await userDoc(uid);
check(d.introSeen === true, 'introSeen が保存された');
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
check(!(await sheetOn()), '再読み込み後は説明シートが出ない');
check((await uidOf()) === uid, '再読み込みしても同じ uid');

// 3. おばあちゃんと話す → tutorial=1
await tapGranny();
await waitText('おばあちゃんの種を見にいく');
await page.getByText('おばあちゃんの種を見にいく', { exact: true }).click();
await page.waitForTimeout(800);
d = await userDoc(uid);
check(d.tutorial === 1 && d.metGranny === true, `tutorial=1, metGranny=true ${d.tutorial},${d.metGranny}`);

// 4. 再読み込み → tutorial=1 から再開（ボタン表示と、おばあちゃんの「remind」）
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
check((await page.textContent('#btnPlant')).includes('おばあちゃんの種に水やり'), 'ボタンが「おばあちゃんの種に水やり」で再開');
await page.screenshot({ path: `${OUT}/p2_2_tutorial1_reload.png` });
await tapGranny();
await waitText('おばあちゃんの種を見にいく');
await page.getByText('おばあちゃんの種を見にいく', { exact: true }).click();

// 5. おばあちゃんの種まで歩くとシートが開く → 手紙 → tutorial=2, grannyLetter
await page.locator('#tL').waitFor({ state: 'visible', timeout: 20000 });
const LETTER = 'できることを数えるって、すてきですね。';
await page.fill('#tL', LETTER);
await page.click('#ok');
await page.waitForTimeout(800);
d = await userDoc(uid);
check(d.tutorial === 2 && d.grannyLetter === LETTER, `tutorial=2, grannyLetter 保存 ${d.tutorial}`);

// 6. おばあちゃんが読んでいる途中で再読み込み → 続きから（花が咲いていて、話しかけると「はじめる」）
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
check((await page.textContent('#btnPlant')).includes('おばあちゃんの話を聞こう'), 'ボタンが「おばあちゃんの話を聞こう」で再開');
await page.screenshot({ path: `${OUT}/p2_3_tutorial2_reload.png` });
await tapGranny();
await waitText('はじめる');
await page.getByText('はじめる', { exact: true }).click();
await page.waitForTimeout(800);
d = await userDoc(uid);
check(d.tutorial === 3, `tutorial=3（講習完了）`);

// 7. 再読み込み → 講習完了のまま
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
const label = await page.textContent('#btnPlant');
check(!/おばあちゃん/.test(label), `講習完了のまま再開（ボタン：${label}）`);
await page.screenshot({ path: `${OUT}/p2_4_done_reload.png` });

// 8. おばあちゃんの種を開くと、自分の手紙とありがとうが残っている
await page.evaluate(() => localStorage.clear()); // 種は localStorage だが、おばあちゃんへの手紙は Firestore から戻るはず
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
check((await uidOf()) === uid, 'localStorage を消しても uid は同じ（IndexedDB）');
check(!(await sheetOn()), 'localStorage を消しても説明シートは出ない（Firestore が正）');

await browser.close();
console.log(process.exitCode ? 'FAILED' : 'ALL PASSED');
