// 水やりのあと、画面の中央で種を大きく映して、芽が出るところを見せる演出（文字なし）
// 水がしみこむ → 種が揺れて割れる → 芽が伸びる → 双葉が開く → 光の粒が昇る → 自動で閉じる（タップでも閉じる）
// 時間の調整は SPROUT_ZOOM だけ触ればよい。描画は drawSproutZoom(ctx, size, t) の純粋な関数（t は開いてからの秒）

export const SPROUT_ZOOM = {
  startAt: 5.6,    // マップの水やり演出の何秒目に開くか（マップの芽が開ききったあと。WATERING_TIMELINE.sprout.end = 5.3）
  drops: { start: .25, end: 1.2 },   // 大きな水滴が落ちる
  wet:   { start: .45, end: 1.6 },   // 土が濡れた色になる
  crack: { start: 1.25, end: 1.75 }, // 種が揺れて割れる
  stem:  { start: 1.6, end: 2.9 },   // 芽が伸びる
  leaves:{ start: 2.6, end: 3.4 },   // 双葉が開く
  motes: { start: 2.8, end: 4.6 },   // 光の粒が昇る
  close: 4.6,      // 閉じはじめる
  total: 5.0,      // 閉じ終わる
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const prog = (t, r) => clamp((t - r.start) / (r.end - r.start), 0, 1);
const easeOut = k => 1 - Math.pow(1 - k, 3);
const backOut = k => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

function ell(ctx, x, y, rx, ry, c, rot = 0) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2); ctx.fill(); }
function glow(ctx, x, y, r, rgb, a) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// 光の粒と水滴の並びは、開くたびに少しだけ変える
export function makeSproutZoomSeed(R = Math.random) {
  return {
    drops: Array.from({ length: 5 }, (_, i) => ({ dx: (R() - .5) * 46, at: .25 + i * .17 + R() * .06 })),
    motes: Array.from({ length: 14 }, () => ({ dx: (R() - .5) * 90, at: 2.8 + R() * 1.3, life: 1.1 + R() * .7, vy: 40 + R() * 40, size: 3 + R() * 4, ph: R() * 6 })),
    grains: Array.from({ length: 26 }, () => ({ x: (R() - .5) * 2, y: (R() - .5) * 2, r: .8 + R() * 1.4 })),
  };
}

// size：正方形のキャンバスの一辺（CSS px）。中心の少し下に種がある
export function drawSproutZoom(ctx, size, t, rnd) {
  const Z = SPROUT_ZOOM, cx = size / 2, gy = size * .66; // gy：地面（種）の高さ
  ctx.clearRect(0, 0, size, size);

  // 背景：やわらかな砂の色の光
  const bg = ctx.createRadialGradient(cx, gy - 30, 10, cx, gy - 30, size * .7);
  bg.addColorStop(0, '#fbf1df'); bg.addColorStop(1, '#f1dcbb');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);

  // 土の盛り上がり（マップの種と同じ色を、大きく）
  ell(ctx, cx, gy + 26, 118, 40, '#d8b07c');
  ell(ctx, cx, gy + 20, 100, 31, '#e2bf8c');
  ctx.fillStyle = 'rgba(160,115,70,.28)';
  for (const g of rnd.grains) { ctx.beginPath(); ctx.arc(cx + g.x * 90, gy + 20 + g.y * 22, g.r, 0, Math.PI * 2); ctx.fill(); }

  // 濡れた土
  const w = easeOut(prog(t, Z.wet));
  if (w > 0) { ell(ctx, cx, gy + 18, 74 * w, 22 * w, `rgba(120,82,48,${.38 * w})`); ell(ctx, cx, gy + 17, 44 * w, 13 * w, `rgba(105,70,40,${.22 * w})`); }

  // 大きな水滴と、はね
  for (const d of rnd.drops) {
    const k = (t - d.at) / .34;
    if (k > 0 && k < 1) {
      const y = 20 + (gy + 10 - 20) * k * k;
      ctx.fillStyle = 'rgba(140,195,230,.92)';
      ctx.beginPath(); ctx.moveTo(cx + d.dx, y - 16); ctx.quadraticCurveTo(cx + d.dx + 10, y + 2, cx + d.dx, y + 7); ctx.quadraticCurveTo(cx + d.dx - 10, y + 2, cx + d.dx, y - 16); ctx.fill();
      ell(ctx, cx + d.dx - 3, y - 1, 2, 3.4, 'rgba(255,255,255,.85)');
    } else if (k >= 1 && k < 1.9) {
      const s = (k - 1) / .9;
      ctx.strokeStyle = `rgba(150,200,235,${.7 * (1 - s)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx + d.dx, gy + 12, 6 + 16 * s, 2 + 5 * s, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 種：揺れて、割れて、殻が左右にひらいて消える
  const c = prog(t, Z.crack), st = easeOut(prog(t, Z.stem));
  const wob = c > 0 && c < 1 ? Math.sin(c * Math.PI * 6) * .16 * (1 - c) : 0;
  const open = clamp((t - Z.crack.end) / .7, 0, 1), fade = 1 - clamp((t - Z.stem.start - .5) / .8, 0, 1);
  if (fade > 0) {
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(cx, gy + 6); ctx.rotate(wob);
    if (c < 1) {
      ell(ctx, 0, 0, 19, 13, '#8a6440'); ell(ctx, -6, -5, 6, 3.2, 'rgba(255,240,215,.35)', -.3);
      if (c > .5) { ctx.strokeStyle = `rgba(250,230,190,${(c - .5) * 2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-2, -12); ctx.lineTo(1, -4); ctx.lineTo(-1, 3); ctx.lineTo(2, 12); ctx.stroke(); }
    } else {
      // 割れた殻（左右）
      const o = easeOut(open);
      ell(ctx, -9 - 14 * o, 3 * o, 10, 12.5, '#8a6440', -.35 * o);
      ell(ctx, 9 + 14 * o, 3 * o, 10, 12.5, '#7d5a39', .35 * o);
    }
    ctx.restore();
  }

  // 芽：まっすぐ伸びて、ゆれる
  if (st > 0) {
    const len = 82 * st, sway = Math.sin(t * 2.2) * 3 * st;
    const topX = cx + sway, topY = gy + 4 - len;
    glow(ctx, cx, gy - len * .5, 70 * st, '255,245,200', .35 * st);
    ctx.strokeStyle = '#6f9a5e'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, gy + 8); ctx.quadraticCurveTo(cx - 6 * st, gy - len * .5, topX, topY); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,225,160,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 1.5, gy + 4); ctx.quadraticCurveTo(cx - 7 * st, gy - len * .5, topX - 1.5, topY + 4); ctx.stroke();
    // 双葉
    const lf = prog(t, Z.leaves), k = lf > 0 ? backOut(lf) : 0;
    if (k > 0) {
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.translate(topX, topY); ctx.rotate(sgn * (.95 - .45 * k)); ctx.scale(k, k);
        ell(ctx, sgn * 0, -17, 10.5, 19, '#86b874');
        ell(ctx, sgn * -2.5, -20, 3.5, 11, 'rgba(210,240,180,.55)');
        ctx.strokeStyle = 'rgba(95,140,80,.55)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, -30); ctx.stroke();
        ctx.restore();
      }
    } else {
      // 開く前の、閉じた双葉のつぼみ
      ell(ctx, topX, topY - 4, 5 * st, 8 * st, '#86b874');
    }
  }

  // 光の粒
  for (const m of rnd.motes) {
    const s = t - m.at;
    if (s <= 0 || s >= m.life) continue;
    const k = s / m.life, a = Math.sin(Math.PI * k);
    const x = cx + m.dx * (.4 + .6 * k) + Math.sin(s * 3 + m.ph) * 6, y = gy - 30 - m.vy * s;
    glow(ctx, x, y, m.size * 3, '255,240,180', .7 * a);
    ell(ctx, x, y, m.size * .45, m.size * .45, `rgba(255,252,235,${a})`);
  }
}
