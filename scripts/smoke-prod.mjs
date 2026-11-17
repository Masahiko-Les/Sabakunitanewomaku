// 公開版の確認：node scripts/smoke-prod.mjs https://sabakunitanewomaku.vercel.app
// 匿名ログイン → 講習（再読み込みをはさむ）→ 種を蒔く → 再読み込みで残っているか、を画面だけで確かめる。
// 蒔く種には危機的な言葉を入れて hidden にし、ほかの人の世界には届かないようにする。
// 終わったら表示される uid と seedId の後片付けを行うこと（Firestore の users/worlds/seeds と、Authentication のユーザー）。
import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';

const URL = process.argv[2] || 'https://sabakunitanewomaku.vercel.app';
await mkdir('screenshots', { recursive: true });
let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })).newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));

const uidOf = () => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const sheetOn = () => page.evaluate(() => document.querySelector('#sheet').classList.contains('on'));
const btn = () => page.textContent('#btnPlant');
const boot = async () => { await page.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0, null, { timeout: 20000 }); await page.waitForTimeout(2000); };
const reload = async () => { await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await boot(); };
const waitText = async (t, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.getByText(t, { exact: true }).first().isVisible()) return;
    const next = page.locator('#sheetBody button', { hasText: 'つぎへ' }).first();
    if (await next.isVisible()) await next.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  throw new Error('見つからない：' + t);
};
const tapGranny = () => page.mouse.click(115, 268);

// 1. はじめて開く
await page.goto(URL, { waitUntil: 'load' });
await page.locator('#sheet.on').waitFor({ timeout: 20000 });
const uid = await uidOf();
check(!!uid, `匿名ログインできた（uid=${uid}）`);
await page.waitForTimeout(800);
await page.screenshot({ path: 'screenshots/prod_1_help.png' });
await page.click('#x'); await page.waitForTimeout(1500);

// 2. 再読み込み（localStorage も消す）→ 説明シートは出ない＝Firestore に保存できている
await reload();
check(!(await sheetOn()), '再読み込み後、説明シートは出ない（Firestore に保存できている）');
check((await uidOf()) === uid, '再読み込みしても同じ uid');

// 3. 講習：おばあちゃんと話す → 再読み込み → 続きから
await tapGranny(); await waitText('おばあちゃんの種を見にいく');
await page.getByText('おばあちゃんの種を見にいく', { exact: true }).click(); await page.waitForTimeout(1500);
await reload();
check((await btn()).includes('おばあちゃんの種に水やり'), '講習 1 から再開');
await tapGranny(); await waitText('おばあちゃんの種を見にいく');
await page.getByText('おばあちゃんの種を見にいく', { exact: true }).click();
await page.locator('#tL').waitFor({ state: 'visible', timeout: 20000 });
await page.fill('#tL', 'できることを数えるって、すてきですね。'); await page.click('#ok'); await page.waitForTimeout(1500);
await reload();
check((await btn()).includes('おばあちゃんの話を聞こう'), '講習 2 から再開');
await tapGranny(); await waitText('はじめる');
await page.getByText('はじめる', { exact: true }).click(); await page.waitForTimeout(1500);
await reload();
check(!/おばあちゃん/.test(await btn()), `講習を終えたまま再開（ボタン：${await btn()}）`);

// 4. 種を蒔く（hidden になる言葉で）→ 相談先シート
await page.mouse.click(237, 453); await page.waitForTimeout(3500);
await page.click('#btnPlant');
await page.fill('#tH', '確認用の種です。消えたい日がある。'); await page.fill('#tF', '公開版の動作確認のための種です。');
await page.click('#ok'); await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/prod_2_crisis.png' });
check((await page.textContent('#sheetBody')).includes('0120-783-556'), '蒔いたあとに相談先のシートが出た');
const seedId = await page.evaluate(() => JSON.parse(localStorage.getItem('sabaku-ni-tane-v3')).seeds.find(s => s.mine)?.id);
check(!!seedId, `種を蒔いた（seedId=${seedId}）`);

// 5. 再読み込み（localStorage も消す）→ Firestore から自分の種が戻る
await page.waitForTimeout(1500);
await reload();
await page.click('#btnMine'); await page.waitForTimeout(800);
check((await page.textContent('#sheetBody')).includes('確認用の種です。'), '再読み込み後も「わたしの種」に残っている（Firestore から読めた）');
await page.screenshot({ path: 'screenshots/prod_3_mine.png' });

await browser.close();
console.log(`後片付け：uid=${uid} seedId=${seedId}`);
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
