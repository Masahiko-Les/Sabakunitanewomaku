// 砂漠に種を蒔く - 女の子の水やり演出（参考コード watering-animation.js を移したもの）
// アプリ向けの変更：種の地面の位置を外から渡せる（seedPx）、濡れ色は土の楕円に合わせて最後に乾かす、
// 地面の効果を「濡れ色」と「波紋」に分けて描ける（波紋は夜の暗さを重ねたあとに描く）
// Canvas 2D 用。既存の描画ループから update() と draw 系を呼ぶだけで動く。
// 時間はすべて「秒」、距離は「px」。フレームレートに依存しない。

// ───────── タイムライン（演出の台本データ） ─────────
// start/end は水やり開始からの経過秒。調整はここだけ触れば全体に反映される。
export const WATERING_TIMELINE = {
  walk:   { start: 0.0, end: 1.2 },  // 種のとなりまで歩く（すでに隣にいる場合は自動でスキップ）
  lift:   { start: 1.2, end: 1.6 },  // じょうろを持ち上げる
  tilt:   { start: 1.5, end: 1.9 },  // じょうろを傾ける
  pour:   { start: 1.8, end: 3.4 },  // 水が出ている時間
  untilt: { start: 3.4, end: 3.8 },  // 傾きを戻す
  lower:  { start: 3.6, end: 4.0 },  // じょうろを下ろす
  wet:    { start: 2.0, end: 3.4 },  // 種のマスが濡れた色になる
  ripple: { start: 2.0, end: 3.8, interval: 0.6 }, // 波紋（interval秒ごとに1つ）
  sprout: { start: 3.7, end: 5.3 },  // 芽が伸びて双葉が開く
  motes:  { start: 3.8, end: 7.0 },  // 光の粒が昇る
  inputUnlock: 4.0,                  // この時点で操作を返す
  total: 7.0,                        // 演出の終わり（onComplete）
};

// ───────── 見た目のパラメータ ─────────
export const WATERING_STYLE = {
  maxTilt: 0.7,            // じょうろの最大傾き（ラジアン）
  liftPx: 3,               // 持ち上げる高さ
  dropsPerSecond: 48,      // 水滴の発生数
  dropFlightSec: 0.35,     // 注ぎ口から地面までの飛行時間
  dropJitterPx: 3,         // 着地点のばらつき
  gravity: 430,            // px/s^2
  dropColor: 'rgba(160,210,255,0.9)',
  dropRadius: 1.4,
  rippleColor: [170, 215, 255],
  rippleMaxRadius: 15,
  wetColor: [20, 30, 40],
  wetMaxAlpha: 0.45,
  motesPerSecond: 9,
  moteColor: [230, 255, 200],
  moteRiseMin: 18, moteRiseMax: 42, // px/s
  moteLifeSec: 2.1,
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const phase = (t, p) => clamp01((t - p.start) / (p.end - p.start));

// ───────── 立ち位置の決定 ─────────
// 種の上下左右4マスのうち、歩ける＆女の子に一番近いマスを返す。
// isWalkable(x, y) は既存マップの判定関数を渡す。
export function chooseStandTile(seedTile, girlTile, isWalkable = () => true) {
  const candidates = [
    { x: seedTile.x - 1, y: seedTile.y, facing: 'right' },
    { x: seedTile.x + 1, y: seedTile.y, facing: 'left' },
    { x: seedTile.x, y: seedTile.y + 1, facing: 'up' },
    { x: seedTile.x, y: seedTile.y - 1, facing: 'down' },
  ].filter((c) => isWalkable(c.x, c.y));
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - girlTile.x, a.y - girlTile.y) -
      Math.hypot(b.x - girlTile.x, b.y - girlTile.y)
  );
  return candidates[0];
}

// ───────── 本体 ─────────
export class WateringAnimation {
  /**
   * @param {object} o
   * @param {number} o.tileSize    1マスのpx
   * @param {{x:number,y:number}} o.seedTile  種のマス座標
   * @param {{x:number,y:number}} o.fromPx    女の子の現在位置（px, 足元中心）
   * @param {{x:number,y:number}} o.standPx   水やりする立ち位置（px, 足元中心）
   * @param {'left'|'right'|'up'|'down'} o.facing 種に対する向き
   * @param {function} [o.onSproutStart] 芽が出始めた瞬間
   * @param {function} [o.onComplete]    演出が終わった瞬間
   */
  constructor(o) {
    this.T = o.tileSize;
    this.seedTile = o.seedTile;
    this.fromPx = o.fromPx;
    this.standPx = o.standPx;
    this.facing = o.facing || 'right';
    this.tl = { ...WATERING_TIMELINE, ...(o.timeline || {}) };
    this.st = { ...WATERING_STYLE, ...(o.style || {}) };
    this.onSproutStart = o.onSproutStart || (() => {});
    this.onComplete = o.onComplete || (() => {});
    // 種の中心（地面の位置）
    this.seedPx = o.seedPx || {
      x: this.seedTile.x * this.T + this.T / 2,
      y: this.seedTile.y * this.T + this.T * 0.65,
    };
    const dist = Math.hypot(this.standPx.x - this.fromPx.x, this.standPx.y - this.fromPx.y);
    this.offset = dist < 1 ? this.tl.walk.end : 0; // 隣にいるなら歩きを飛ばす
    this.startMs = null;
    this.lastMs = null;
    this.drops = [];
    this.motes = [];
    this.spout = null;
    this.firedSprout = false;
    this.finished = false;
    this.state = this._stateAt(this.offset);
  }

  start(nowMs = performance.now()) {
    this.startMs = nowMs;
    this.lastMs = nowMs;
  }

  // 「動きを減らす」設定の人向け：演出を飛ばして完成状態にする
  skipToEnd() {
    this.startMs = performance.now() - (this.tl.total - this.offset) * 1000;
    this.lastMs = this.startMs;
    this.drops = [];
    this.motes = [];
  }

  get running() {
    return this.startMs !== null && !this.finished;
  }

  // 既存の描画で女の子を描いたあと、注ぎ口の位置を教える（drawGirlWithCanの戻り値をそのまま渡せる）
  setSpout(p) {
    this.spout = p;
  }

  update(nowMs = performance.now()) {
    if (this.startMs === null) return this.state;
    const dt = Math.min((nowMs - this.lastMs) / 1000, 0.05);
    this.lastMs = nowMs;
    const t = (nowMs - this.startMs) / 1000 + this.offset;
    this.state = this._stateAt(t);

    if (!this.firedSprout && t >= this.tl.sprout.start) {
      this.firedSprout = true;
      this.onSproutStart();
    }

    // 水滴の発生
    if (t >= this.tl.pour.start && t < this.tl.pour.end) {
      const n = this._spawnCount(this.st.dropsPerSecond, dt);
      for (let i = 0; i < n; i++) this._spawnDrop();
    }
    // 水滴の移動
    for (const d of this.drops) {
      d.age += dt;
      d.x += d.vx * dt;
      d.vy += this.st.gravity * dt;
      d.y += d.vy * dt;
    }
    this.drops = this.drops.filter((d) => d.age < d.life);

    // 光の粒
    if (t >= this.tl.motes.start && t < this.tl.motes.end) {
      const n = this._spawnCount(this.st.motesPerSecond, dt);
      for (let i = 0; i < n; i++) {
        this.motes.push({
          x: this.seedPx.x + (Math.random() - 0.5) * 18,
          y: this.seedPx.y,
          v: this.st.moteRiseMin + Math.random() * (this.st.moteRiseMax - this.st.moteRiseMin),
          life: 1,
        });
      }
    }
    for (const m of this.motes) {
      m.y -= m.v * dt;
      m.x += Math.sin(m.y / 8) * 18 * dt;
      m.life -= dt / this.st.moteLifeSec;
    }
    this.motes = this.motes.filter((m) => m.life > 0);

    if (!this.finished && t >= this.tl.total) {
      this.finished = true;
      this.onComplete();
    }
    return this.state;
  }

  _spawnCount(perSec, dt) {
    const x = perSec * dt;
    return Math.floor(x) + (Math.random() < x % 1 ? 1 : 0);
  }

  _spawnDrop() {
    const s = this.spout || this._fallbackSpout();
    const tf = this.st.dropFlightSec * (0.85 + Math.random() * 0.3);
    const tx = this.seedPx.x + (Math.random() - 0.5) * 2 * this.st.dropJitterPx;
    const ty = this.seedPx.y + (Math.random() - 0.5) * this.st.dropJitterPx;
    const vx = (tx - s.x) / tf;
    const vy = (ty - s.y - 0.5 * this.st.gravity * tf * tf) / tf;
    this.drops.push({ x: s.x, y: s.y, vx, vy, age: 0, life: tf });
  }

  _fallbackSpout() {
    const dir = this.facing === 'left' ? -1 : 1;
    return { x: this.standPx.x + dir * 22, y: this.standPx.y - 14 };
  }

  _stateAt(t) {
    const tl = this.tl;
    const w = clamp01((t - tl.walk.start) / (tl.walk.end - tl.walk.start));
    const walking = this.startMs !== null && w < 1 && this.offset === 0;
    const pos = {
      x: this.fromPx.x + (this.standPx.x - this.fromPx.x) * w,
      y: this.fromPx.y + (this.standPx.y - this.fromPx.y) * w,
    };
    const started = this.startMs !== null;
    const lift = started ? easeOut(phase(t, tl.lift)) - easeOut(phase(t, tl.lower)) : 0;
    const tilt = started
      ? this.st.maxTilt * (easeOut(phase(t, tl.tilt)) - easeOut(phase(t, tl.untilt)))
      : 0;
    return {
      t,
      girlPx: pos,
      facing: walking ? this._walkFacing() : this.facing,
      walking,
      walkCycle: walking ? t * 2.5 : 0,       // 足の動き（スプライトのコマ送りにも使える）
      lift,                                   // 0〜1 じょうろの持ち上げ量
      tilt,                                   // ラジアン じょうろの傾き
      pouring: started && t >= tl.pour.start && t < tl.pour.end,
      wet: started ? easeOut(phase(t, tl.wet)) : 0,
      seedVisible: !started || t < tl.sprout.start,
      sprout: started ? easeOut(phase(t, tl.sprout)) : 0,
      lockInput: started && t < tl.inputUnlock,
    };
  }

  _walkFacing() {
    const dx = this.standPx.x - this.fromPx.x;
    const dy = this.standPx.y - this.fromPx.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  // マップのタイルを描いた直後、キャラより前に呼ぶ（濡れ色・波紋）
  drawGroundEffects(ctx) { this.drawWet(ctx); this.drawRipples(ctx); }

  // 濡れ色：種の土（楕円）の形に。演出の最後の 1.2 秒で乾いていく
  drawWet(ctx, rx = 13, ry = 5.5) {
    const s = this.state;
    const dry = 1 - phase(s.t, { start: this.tl.total - 1.2, end: this.tl.total });
    const a = this.st.wetMaxAlpha * s.wet * (this.startMs === null ? 0 : dry);
    if (a <= 0) return;
    const [r, g, b] = this.st.wetColor;
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.beginPath();
    ctx.ellipse(this.seedPx.x, this.seedPx.y + 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRipples(ctx) {
    const s = this.state;
    const rp = this.tl.ripple;
    if (this.startMs !== null && s.t > rp.start && s.t < rp.end) {
      const p = ((s.t - rp.start) % rp.interval) / rp.interval;
      const [r, g, b] = this.st.rippleColor;
      const rad = 3 + p * (this.st.rippleMaxRadius - 3);
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.6 * (1 - p)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(this.seedPx.x, this.seedPx.y, rad, rad * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // キャラを描いたあとに呼ぶ（水滴・光の粒）
  drawAirEffects(ctx) {
    ctx.fillStyle = this.st.dropColor;
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, this.st.dropRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    const [r, g, b] = this.st.moteColor;
    for (const m of this.motes) {
      ctx.fillStyle = `rgba(${r},${g},${b},${m.life})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ───────── 仮の絵（スプライトができたら差し替える） ─────────

// 芽。progress 0〜1。演出後も「芽の状態の種」はこれで progress=1 として描ける。
export function drawSprout(ctx, cx, groundY, progress) {
  const h = 14 * progress;
  ctx.fillStyle = `rgba(190,255,190,${0.22 * progress})`;
  ctx.beginPath();
  ctx.arc(cx, groundY - h / 2, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8fd18a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, groundY);
  ctx.lineTo(cx, groundY - h);
  ctx.stroke();
  if (progress > 0.5) {
    const l = (progress - 0.5) * 2 * 7;
    ctx.fillStyle = '#a6e39a';
    ctx.beginPath();
    ctx.ellipse(cx - l * 0.7, groundY - h, l, l * 0.45, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + l * 0.7, groundY - h, l, l * 0.45, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 女の子＋じょうろ。footX/footY は足元中心。戻り値は注ぎ口の先端（anim.setSpoutに渡す）。
// up/down向きは左右の絵で代用している（4方向スプライトに差し替える前提）。
export function drawGirlWithCan(ctx, footX, footY, s) {
  const dir = s.facing === 'left' ? -1 : 1;
  const bob = s.walking ? Math.abs(Math.sin(s.walkCycle * Math.PI)) * 2 : 0;
  const y = footY - 16 - bob; // 体の中心
  ctx.save();
  ctx.translate(footX, 0);
  ctx.scale(dir, 1);
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, footY, 8, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 足
  const sw = s.walking ? Math.sin(s.walkCycle * Math.PI * 2) * 2 : 0;
  ctx.fillStyle = '#3a2e2a';
  ctx.fillRect(-4 + sw, y + 9, 3, 7);
  ctx.fillRect(1 - sw, y + 9, 3, 7);
  // ワンピース
  ctx.fillStyle = '#d9c8a8';
  ctx.beginPath();
  ctx.moveTo(-7, y + 10);
  ctx.lineTo(-4, y - 3);
  ctx.lineTo(4, y - 3);
  ctx.lineTo(7, y + 10);
  ctx.fill();
  // 顔と髪
  ctx.fillStyle = '#f1d3b8';
  ctx.beginPath();
  ctx.arc(1, y - 9, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a3326';
  ctx.beginPath();
  ctx.arc(0, y - 11, 6.5, Math.PI * 0.9, Math.PI * 2.15);
  ctx.fill();
  ctx.fillRect(-7, y - 11, 4, 9);
  ctx.fillStyle = '#2b1f1a';
  ctx.fillRect(4, y - 9, 1.5, 2);
  // 腕
  const ax = 5, ay = y - 1 - s.lift * WATERING_STYLE.liftPx;
  ctx.strokeStyle = '#f1d3b8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(2, y - 1);
  ctx.lineTo(ax + 3, ay + 2);
  ctx.stroke();
  // じょうろ
  const cx = ax + 6, cy = ay + 3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(s.tilt);
  ctx.fillStyle = '#8fb3b0';
  ctx.fillRect(-3, -4, 10, 9);
  ctx.strokeStyle = '#8fb3b0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, -1);
  ctx.lineTo(14, -6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1, -5, 3.5, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // 注ぎ口の先端（ローカル(14,-6)を回転して世界座標へ）
  const lx = 14 * Math.cos(s.tilt) + 6 * Math.sin(s.tilt);
  const ly = 14 * Math.sin(s.tilt) - 6 * Math.cos(s.tilt);
  return { x: footX + dir * (cx + lx), y: cy + ly };
}
