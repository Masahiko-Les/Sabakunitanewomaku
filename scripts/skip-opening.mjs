// これまでのテスト用：オープニングを見た扱いにしてから開く（オープニング自体は e2e-opening.mjs で確かめる）
export async function newContext(browser, opts) {
  const c = await browser.newContext(opts);
  await c.addInitScript(() => { try { localStorage.setItem('sabaku.openingSeen', '1'); } catch (e) {} });
  return c;
}
