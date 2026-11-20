// これまでのテスト用：オープニングを見た扱いにしてから開く（オープニング自体は e2e-opening.mjs で確かめる）
export async function newContext(browser, opts) {
  const c = await browser.newContext(opts);
  // テストの途中でオープニングを確かめたいときは、sessionStorage に sabaku-test-opening を入れる（同じタブの再読み込みでも残る）
  await c.addInitScript(() => { try { if (!sessionStorage.getItem('sabaku-test-opening')) localStorage.setItem('sabaku.openingSeen', '1'); } catch (e) {} });
  return c;
}
