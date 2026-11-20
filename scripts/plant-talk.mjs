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
  // 種が落ちる → 風が運ぶ → おばあちゃんのひと言 →「閉じる」
  await page.locator('#bt').waitFor({ state: 'visible', timeout: 10000 });
  await page.click('#bt'); await page.waitForTimeout(500);
}
