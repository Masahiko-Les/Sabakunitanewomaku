// 花が咲くときの、光り輝く演出（ありがとうを返したとき／返ってきたとき）
// 大きな閃光 → 回る光の筋 → 広がる光の輪 → はじける光の粒 → 昇る光、のあとに、花のまわりの光がしばらく残る。
// 時間は performance.now() で計る（フレームレートに依存しない）。長さや強さは BLOOM_BURST だけ触ればよい。

export const BLOOM_BURST = {
  total: 4.6,        // 全体の長さ（秒）
  flashR: 300,       // 閃光の大きさ（px）
  screenFlash: .32,  // 画面全体が白く光る強さ
  rays: 16,          // 光の筋の本数
  rayLen: 230,
  rings: 3,
  ringR: 240,
  sparks: 72,        // はじける光の粒
  motes: 28,         // 昇る光
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = k => 1 - Math.pow(1 - k, 3);
// 0 → 1 → 0 の山（a で立ち上がり、b で消える）
const hill = (t, a, b) => t <= 0 || t >= b ? 0 : t < a ? t / a : 1 - (t - a) / (b - a);

function star(ctx, x, y, r, a) {
  // 4 方向にとがった光（きらめき）
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}
function glow(ctx, x, y, r, rgb, a) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.35, `rgba(${rgb},${a * .55})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

export class BloomBurst {
  // x, y：花の中心（ワールド座標）。rgb：花の色（'255,150,180' の形）
  constructor(x, y, rgb, { reduced = false } = {}) {
    this.x = x; this.y = y; this.rgb = rgb; this.reduced = reduced;
    this.t0 = null; // 画面に入ったときに始める
    const R = Math.random;
    this.spin = R() * Math.PI * 2;
    this.sparks = Array.from({ length: BLOOM_BURST.sparks }, () => {
      const a = R() * Math.PI * 2, v = 70 + R() * 230;
      return { vx: Math.cos(a) * v, vy: Math.sin(a) * v * .8 - 40, life: 1.6 + R() * 2, size: 2 + R() * 4.5,
        tw: R() * 9, col: R() < .45 ? '255,255,245' : R() < .6 ? '255,225,130' : rgb, delay: R() * .25 };
    });
    this.motes = Array.from({ length: BLOOM_BURST.motes }, () => ({
      dx: (R() - .5) * 70, delay: .3 + R() * 2.4, life: 1.6 + R() * 1.2, vy: 35 + R() * 45, sway: R() * 6, size: 1.5 + R() * 2.5 }));
  }
  get started() { return this.t0 !== null; }
  start(now = performance.now()) { if (this.t0 === null) this.t0 = now; }
  time(now = performance.now()) { return this.t0 === null ? 0 : (now - this.t0) / 1000; }
  get duration() { return this.reduced ? 1.6 : BLOOM_BURST.total; }
  done(now) { return this.started && this.time(now) >= this.duration; }

  // 夜の暗闇に開ける穴の大きさと強さ（hole(dctx, x, y, r, a) にそのまま渡す）
  light(now) {
    const t = this.time(now);
    if (!this.started) return null;
    const k = clamp(1 - t / this.duration, 0, 1);
    return { x: this.x, y: this.y, r: 60 + 220 * easeOut(clamp(t / .4, 0, 1)) * k, a: .95 * Math.min(1, k * 1.6) };
  }

  // 画面全体の白い閃光（スクリーン座標で、いちばん最後に重ねる）
  drawScreenFlash(ctx, w, h, now) {
    if (this.reduced || !this.started) return;
    const a = BLOOM_BURST.screenFlash * hill(this.time(now), .12, .9);
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,248,225,${a})`; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ワールド座標（カメラを translate した状態）で呼ぶ
  draw(ctx, now) {
    if (!this.started) return;
    const t = this.time(now), { x, y, rgb } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.reduced) {
      // 動きを減らす設定：花のまわりが、やわらかく光って消えるだけ
      const a = hill(t, .3, this.duration);
      glow(ctx, x, y, 90, rgb, .7 * a); glow(ctx, x, y, 40, '255,255,240', .8 * a);
      ctx.restore(); return;
    }
    const B = BLOOM_BURST;
    // 大きな閃光
    const fa = hill(t, .18, 1.8);
    glow(ctx, x, y, B.flashR * (.4 + .6 * easeOut(clamp(t / .5, 0, 1))), '255,250,225', .9 * fa);
    glow(ctx, x, y, 120, rgb, .8 * hill(t, .3, 2.6));
    // 回る光の筋
    const ra = hill(t, .45, 3.2);
    if (ra > 0) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.spin + t * .55);
      const len = B.rayLen * (.35 + .65 * easeOut(clamp(t / .7, 0, 1)));
      for (let i = 0; i < B.rays; i++) {
        const w = i % 2 ? .05 : .085, l = len * (i % 2 ? .7 : 1);
        const g = ctx.createLinearGradient(0, 0, l, 0);
        g.addColorStop(0, `rgba(255,252,230,${.75 * ra})`); g.addColorStop(.4, `rgba(${i % 3 ? '255,230,150' : rgb},${.4 * ra})`); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(l, -l * w); ctx.lineTo(l, l * w); ctx.closePath(); ctx.fill();
        ctx.rotate(Math.PI * 2 / B.rays);
      }
      ctx.restore();
    }
    // 広がる光の輪
    for (let i = 0; i < B.rings; i++) {
      const k = clamp((t - i * .28) / 1.5, 0, 1);
      if (k <= 0 || k >= 1) continue;
      ctx.strokeStyle = `rgba(${i === 1 ? rgb : '255,245,210'},${.85 * (1 - k)})`;
      ctx.lineWidth = 7 * (1 - k) + .5;
      ctx.beginPath(); ctx.ellipse(x, y, B.ringR * easeOut(k), B.ringR * easeOut(k) * .62, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // はじける光の粒（空気の抵抗で止まりながら、少し昇る）
    for (const p of this.sparks) {
      const s = t - p.delay;
      if (s <= 0 || s >= p.life) continue;
      const d = (1 - Math.exp(-2.4 * s)) / 2.4; // 減速しながら進んだ距離
      const px = x + p.vx * d, py = y + p.vy * d - 14 * s * s;
      const a = (1 - s / p.life) * (.6 + .4 * Math.sin(t * 14 + p.tw));
      ctx.fillStyle = `rgb(${p.col})`;
      glow(ctx, px, py, p.size * 3.2, p.col, .45 * a);
      ctx.fillStyle = `rgb(${p.col})`; star(ctx, px, py, p.size * 1.6, a); ctx.globalAlpha = 1;
    }
    // 花から昇る光
    for (const m of this.motes) {
      const s = t - m.delay;
      if (s <= 0 || s >= m.life) continue;
      const k = s / m.life, px = x + m.dx * (.3 + .7 * k) + Math.sin(s * 3 + m.sway) * 6, py = y - m.vy * s;
      glow(ctx, px, py, m.size * 4, '255,240,190', .7 * Math.sin(Math.PI * k));
    }
    // 花のまわりに残る光（ゆっくり脈打って消える）
    const after = hill(t - .6, .8, B.total - .6);
    glow(ctx, x, y, 54 * (1 + .12 * Math.sin(t * 5)), rgb, .75 * after);
    glow(ctx, x, y, 22, '255,255,245', .85 * after);
    ctx.restore();
  }
}
