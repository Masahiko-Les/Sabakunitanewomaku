// これまでのテスト用：オープニングを見た扱いにしてから開く（オープニング自体は e2e-opening.mjs で確かめる）
// 手紙が届いたときのお知らせ（画面の中央）は、出たら「あとで」で閉じる（お知らせ自体は e2e-notice-bloom.mjs で確かめる。keepNotice: true で閉じない）
export async function newContext(browser, opts = {}) {
  const { keepNotice, ...o } = opts;
  const c = await browser.newContext(o);
  if (!keepNotice) {
    const later = p => p.addLocatorHandler(p.locator('#notice.on'), async () => { await p.click('#noticeLater').catch(() => {}); await p.waitForTimeout(350); }, { noWaitAfter: true });
    // マップを直接タップするとき（page.mouse.click）も、お知らせが出ていれば先に閉じる
    const dismiss = async p => { if (await p.evaluate(() => !!document.querySelector('#notice.on')).catch(() => false)) { await p.click('#noticeLater').catch(() => {}); await p.waitForTimeout(350); } };
    const np = c.newPage.bind(c); c.newPage = async () => { const p = await np(); await later(p);
      const mc = p.mouse.click.bind(p.mouse); p.mouse.click = async (...a) => { await dismiss(p); return mc(...a); }; return p; };
  }
  // テストの途中でオープニングを確かめたいときは、sessionStorage に sabaku-test-opening を入れる（同じタブの再読み込みでも残る）
  await c.addInitScript(() => { try { if (!sessionStorage.getItem('sabaku-test-opening')) localStorage.setItem('sabaku.openingSeen', '1'); } catch (e) {} });
  return c;
}
