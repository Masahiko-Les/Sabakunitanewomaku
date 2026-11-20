// 種を蒔く（おばあちゃんとの会話）をテストから進める
// f を省くと「いまはいいや」。crisis のときは、風の演出のかわりに相談先シートが出るので、閉じずに戻る
export async function sowSeed(page, h, f, { crisis = false } = {}) {
  await page.click('#btnPlant');
  await page.locator('#tIn').waitFor({ state: 'visible' });
  await page.fill('#tIn', h); await page.click('#pTalk');
  await page.locator('#pSkip').waitFor({ state: 'visible' });
  if (f) { await page.fill('#tIn', f); await page.click('#pTalk'); } else await page.click('#pSkip');
  await page.locator('#pPlant').waitFor({ state: 'visible' });
  await page.click('#pPlant');
  if (crisis) { await page.waitForTimeout(1500); return; }
  // 種が落ちる → 強い風が綿毛を運ぶ → 最後のトーストまで待つ（演出中はカメラが揺れるので、タップの位置がずれないように）
  for (let i = 0; i < 200; i++) { if ((await page.textContent('#toast')).includes('きっと届くさ')) break; await page.waitForTimeout(50); }
  await page.waitForTimeout(300);
}
