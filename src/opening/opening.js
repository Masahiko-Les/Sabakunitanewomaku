// オープニング（opening-prototype.html をそのまま移植）
// ① 暗闇の女の子（問いかけ・選択）→ ② 星になって落ちる → タイトル → ③ タップで減速・着地の閃光
// 試作の ④ の村の絵（drawLand）は仮の絵なので移植しない。着地の閃光の下に、アプリ本来の地図が見える。
// 文言・タイミング・描画は試作のまま。INTEGRATION.md を参照。
import './opening.css';

const GIRL_SVG = `<svg id="girl" viewBox="18 8 106 98" aria-hidden="true">
    <defs>
      <linearGradient id="gHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e4a3b"/><stop offset=".55" stop-color="#4a3a2e"/><stop offset="1" stop-color="#3a2d23"/></linearGradient>
      <linearGradient id="gSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3ec"/><stop offset="1" stop-color="#f8d9c9"/></linearGradient>
      <linearGradient id="gKnit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#de7060"/><stop offset="1" stop-color="#c0503f"/></linearGradient>
      <linearGradient id="gIris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1a1e"/><stop offset=".55" stop-color="#6e3d33"/><stop offset="1" stop-color="#d79a63"/></linearGradient>
      <radialGradient id="gBlush"><stop offset="0" stop-color="#ff8f98" stop-opacity=".55"/><stop offset="1" stop-color="#ff8f98" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="70" cy="100" rx="36" ry="3.2" fill="rgba(0,0,0,.4)"/>
    <g transform="translate(60 56) scale(.8) translate(-60 -56)">
    <!-- 奥の脚 -->
    <path d="M56 66 L52 98" stroke="#e8bfad" stroke-width="7.5" stroke-linecap="round"/>
    <rect x="47.6" y="91" width="8" height="7" rx="2" fill="#e9e6e3"/>
    <path d="M44 97 h12 q3 0 3 4 v3.5 h-18 q-2 0 -1.6 -2.6 q.8 -4.9 4.6 -4.9 z" fill="#e8e5e2"/>
    <!-- 体（赤いニット） -->
    <path d="M74 53 C88 51 99 62 101 80 C103 93 102 103 96 107.5 L70 108 C64 100 59 88 55 77 C52 69 53 58 60 55.5 C65 54 70 54.5 74 53 Z" fill="url(#gKnit)"/>
    <path d="M71 107.6 L96 107" stroke="#a52234" stroke-width="3.6" opacity=".5"/>
    <path d="M86 62 Q92 80 92 104 M80 70 Q84 86 84 106" stroke="#9e1f30" stroke-width=".7" fill="none" opacity=".3"/>
    <!-- 手前の脚 -->
    <path d="M49.5 66 L45.5 99" stroke="#f6d3c2" stroke-width="8.5" stroke-linecap="round"/>
    <ellipse cx="51" cy="63.5" rx="7" ry="6.6" fill="#f8dccd"/>
    <path d="M57 59 Q55 66 58 72" stroke="#a52234" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
    <rect x="41.2" y="92" width="8.6" height="7.2" rx="2" fill="#fafafa"/>
    <path d="M37.5 98.5 h12.5 q3.4 0 3.4 4.4 v3.8 h-19.6 q-2.2 0 -1.8 -2.8 q.9 -5.4 5.5 -5.4 z" fill="#fdfdfd"/>
    <path d="M32.6 106.4 h20.8" stroke="#d9d4d0" stroke-width="1.2"/>
    <!-- 膝を抱える腕 -->
    <path d="M80 60 Q74 80 51 85" stroke="url(#gKnit)" stroke-width="9.5" fill="none" stroke-linecap="round"/>
    <path d="M51.5 80.6 Q49.4 85 51.5 89.4" stroke="#a52234" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="45" cy="85" rx="3" ry="2.6" fill="#f6d3c2"/>
    </g>
    <!-- 頭（膝に顔をうずめ気味に、うつむいて目を閉じる） -->
    <g transform="translate(55 58) scale(1.25) translate(-55 -58) rotate(-12 62 46)">
      <path d="M43 46 C42 32 52 24 63 24 C76 24 84 32 84 46 L84 59 Q84 62 81 62 L69 62 L69 50 Z" fill="url(#gHair)"/>
      <path d="M44 44 C44 34 52 29 59 30 C67 31 72 38 71 47 C70 56 64 61 57 61 C50 61 44 55 44 44 Z" fill="url(#gSkin)"/>
      <ellipse cx="62.5" cy="53" rx="4.6" ry="2.8" fill="url(#gBlush)"/>
      <ellipse cx="48" cy="53" rx="3" ry="2.2" fill="url(#gBlush)"/>
      <path d="M61.6 52.4 l.8 -1.3 M63.6 52.6 l.8 -1.3" stroke="#f08c95" stroke-width=".55" stroke-linecap="round" opacity=".7"/>
      <path d="M55 48.6 Q59 51.6 63.4 48.8" stroke="#21151a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M55.6 49.6 l-.8 1.4 M57.8 50.7 l-.4 1.5 M60.2 50.9 l0 1.5" stroke="#21151a" stroke-width=".7" stroke-linecap="round"/>
      <path d="M45.6 48.8 Q48 50.8 50.6 49.2" stroke="#21151a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M46.2 49.6 l-.6 1.2 M48.2 50.3 l-.3 1.3" stroke="#21151a" stroke-width=".6" stroke-linecap="round"/>
      <path d="M61.4 51.6 C61.6 54.5 60.6 57 61.2 59 C61.8 60.8 63.6 60.2 63.4 58.4 C63.2 56 62.2 53.8 61.4 51.6 Z" fill="#6fb2e8" opacity=".95"/>
      <circle cx="62.1" cy="58.4" r=".55" fill="#fff"/>
      <path d="M47.6 51.4 C47.2 53 47 54 47.3 55.2" stroke="#6fb2e8" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M56 43.8 Q59.5 42.6 63 43.8 M46.5 44 Q48.5 43 50.5 43.6" stroke="#4a3a2e" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M44.6 52.6 l-.9 .9" stroke="#e3a99a" stroke-width=".8" stroke-linecap="round"/>
      <path d="M49.4 58 Q51 57.1 52.6 57.9" stroke="#c96f6a" stroke-width=".9" fill="none" stroke-linecap="round"/>
      <path d="M42.6 44.5 C42 32.5 52 25 63 25 C75 25 82.5 32.5 82 44.5 L72 44.5 L71.5 42.4 L43.4 42.4 Z" fill="url(#gHair)"/>
      <path d="M42.6 43 L42.4 57.5 Q42.6 59 44.4 59 L46.6 59 L46.4 44 Z" fill="url(#gHair)"/>
      <path d="M52 28.5 Q63 24.5 74 29" stroke="#f3d6c8" stroke-width="1.8" fill="none" opacity=".35" stroke-linecap="round"/>
    </g>
  </svg>`;

const HTML = `<div id="stage">
  <canvas id="cv"></canvas>
  ${GIRL_SVG}
  <button id="skip">スキップ ›</button>
  <div id="voice" class="hide"><span id="vt"></span><span class="next" id="vnext">▼</span></div>
  <div id="chips"></div>
  <div id="title">砂漠に種を蒔く<small>— sow seeds in the desert —</small></div>
  <div id="tapHint">画面をタップ</div>
</div>`;

// 着地のあと、焚き火のそばのおばあちゃんの到着のことば（選んだ関心テーマで 3 つ目が変わる）
export function arrivalLines(c) {
  const L = ['おや……。', 'お空から落ちてきたんかい。\nここに来る人は、みんなそうさ。'];
  if (c === 'none') L.push('言葉にならんもんを、抱えてきたんだねぇ。\nそれで、ええんよ。');
  else if (c === 'その他') L.push('あんたにしか分からん苦労を、\n抱えてきたんだねぇ。');
  else if (c) L.push(`${c}のことを、抱えてきたんだねぇ。\n……よう、ここまで来た。`);
  L.push('まずは火にあたって、あったまりな。');
  return L;
}

// 到着のことばに続く、初回講習（おばあちゃんの種に水やり）の説明
export const OPENING_TUT = [
  'ここはね、「生きづらさ」っていう名前の砂漠なんだ。\nここに来た人は、みんなそれぞれ、自分だけの砂漠を歩いてる。',
  'ひとりで歩くには、ちょいと風が強すぎる所でね。',
  'でもね、ときどき、どこかの誰かが蒔いた種が、風に運ばれてあんたの砂漠にも届くんだよ。',
  'その種にやさしい言葉で水をあげて、蒔いた人が「ありがとう」を返すと、花が咲く。\n花が咲くと、砂漠が少しずつ緑になっていくんだ。',
  '種の蒔き方を教える前に、まずは水やりを覚えてほしいんだ。',
  'じつはね、わたしも種を蒔いてあるんだよ。ほら、わたしのすぐそばの、左のところさ。',
  '水やりのこつは「アドバイスより、共感」。\n「こうしたら？」より、「それはさみしいね」「その考え方、すてきだね」って、受けとめる言葉をかけてあげることさ。',
  'うまく書こうとしなくていいからね。\nわたしの種を読んで、やさしい言葉で水をあげてみておくれ。'];

export function grandmaLines(c) { return [...arrivalLines(c), ...OPENING_TUT]; }

/**
 * オープニングを始める。
 * - onChoice(value)：女の子の問いで選んだとき（関心テーマ）
 * - onLanding()：着地の閃光が始まるとき（この下で、地図を夜にしておく）
 * - onLanded(choice)：閃光が消えたあと（試作でおばあちゃんの会話が始まる 1900ms 後）。オープニングは片付け済み
 */
export function startOpening(container, { onChoice = () => {}, onLanding = () => {}, onLanded = () => {} } = {}) {
container.innerHTML = HTML;
const $ = id => container.querySelector('#' + id);
const girlEl = $('girl');
const cv = $('cv'), ctx = cv.getContext('2d');
let W, H, DPR;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
let alive = true, raf = 0;

/* ---------- 状態 ---------- */
const S = { girlY: .29, scene: 'dark', girlA: 0, orbA: 0, fallStart: 0, landStart: 0, choice: null };
let stars = [];

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  initStars();
}
function initStars() {
  stars = [];
  for (let i = 0; i < 150; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: .3 + Math.random() * 1.2, tw: Math.random() * 6.28 });
}
addEventListener('resize', resize);

/* ---------- 待機・中断のしくみ ---------- */
const ABORT = Symbol('abort');
const waits = new Set();
let tapHandlers = [];
function wait(fn) {
  return new Promise((res, rej) => {
    const w = { rej }; waits.add(w);
    fn(v => { if (waits.has(w)) { waits.delete(w); res(v); } });
  });
}
function cancelAll() { for (const w of waits) w.rej(ABORT); waits.clear(); tapHandlers = []; }
const sleep = ms => wait(done => setTimeout(done, ms));
const waitTap = () => wait(done => tapHandlers.push(done));
$('stage').addEventListener('pointerdown', () => { const hs = tapHandlers; tapHandlers = []; hs.forEach(h => h()); });
for (const id of ['skip', 'chips']) $(id).addEventListener('pointerdown', e => e.stopPropagation());

const tweens = [];
function tween(o, k, to, d) { tweens.push({ o, k, from: o[k], to, t0: performance.now(), d }); }
function updTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i], x = Math.min(1, (now - t.t0) / t.d);
    t.o[t.k] = t.from + (t.to - t.from) * (x * x * (3 - 2 * x));
    if (x >= 1) tweens.splice(i, 1);
  }
}

/* ---------- 文字送り ---------- */
async function speak(textEl, nextEl, text, opt = {}) {
  let ff = false; const h = () => { ff = true; };
  tapHandlers.push(h);
  nextEl.classList.remove('on');
  for (let i = 1; i <= text.length; i++) {
    if (ff) break;
    textEl.textContent = text.slice(0, i);
    await sleep(text[i - 1] === '…' ? 140 : 62);
  }
  tapHandlers = tapHandlers.filter(x => x !== h);
  textEl.textContent = text;
  if (opt.noWait) return;
  await sleep(200);
  nextEl.classList.add('on');
  await waitTap();
  nextEl.classList.remove('on');
}
const girlSay = (t, o) => speak($('vt'), $('vnext'), t, o);

/* ---------- 選択肢 ---------- */
// ひとまずこの 4 つ（＋「まだ、言葉にできない」）。今後増やす。増やすときは firestore.rules の interest の一覧にも入っているか確かめる
const OPTIONS = ['吃音', '介護', '人間関係', 'その他'];
function prepareChips() {
  const box = $('chips'), voice = $('voice');
  box.innerHTML = '';
  const all = [...OPTIONS.map(o => [o, o]), ['まだ、言葉にできない', 'none']];
  all.forEach(([label, val]) => {
    const b = document.createElement('button');
    b.className = 'chip' + (val === 'none' ? ' wide' : '');
    b.textContent = label; b.dataset.val = val;
    box.appendChild(b);
  });
  // 選択肢のすぐ上に文字を置く
  const top = box.getBoundingClientRect().top;
  voice.style.top = 'auto';
  voice.style.bottom = (H - top + 14) + 'px';
  voice.style.minHeight = '0';
  // 文字（2行ぶん）と重ならない位置まで女の子を上げる
  const voiceTop = top - 14 - 70;
  const girlCenter = voiceTop - 24 - 36;
  const y = clamp(Math.min(.29, girlCenter / H), .1, .29);
  if (y < S.girlY) tween(S, 'girlY', y, 900);
}
function choose() {
  const box = $('chips');
  return wait(done => {
    [...box.children].forEach(b => {
      const val = b.dataset.val;
      b.onclick = () => {
        if (box.dataset.locked) return; box.dataset.locked = '1';
        [...box.children].forEach(c => c.classList.add(c === b ? 'picked' : 'dim'));
        setTimeout(() => { box.classList.remove('on'); setTimeout(() => { delete box.dataset.locked; done(val); }, 500); }, 650);
      };
    });
    requestAnimationFrame(() => box.classList.add('on'));
  });
}
function girlReply(c) {
  if (c === 'none') return ['うん。\n言葉にならなくても、いいよ。'];
  if (c === 'その他') return ['うん。\n名前のない苦しさも、ちゃんと苦しさだよ。'];
  return [`「${c}」……うん。`, 'ずっと、ひとりで抱えてきたんだね。'];
}

/* ---------- 流れ ---------- */
async function opening() {
  try {
    S.scene = 'dark'; S.girlA = 0; S.orbA = 0; S.choice = null;
    await sleep(900);
    tween(S, 'girlA', 1, 2400);
    await sleep(2200);
    $('voice').classList.remove('hide');
    await girlSay('ここは、暗闇……');
    await girlSay('何もない、孤独な場所……');
    $('vt').textContent = '';
    prepareChips();
    await sleep(500);
    await girlSay('あなたが抱える\n生きづらさは、ありますか？', { noWait: true });
    const c = await choose();
    S.choice = c;
    onChoice(c);
    await sleep(400);
    for (const l of girlReply(c)) await girlSay(l);
    await girlSay('この下にはね、何かを抱えた人たちが\nひとりずつ、種を蒔いている場所があるの。');
    $('voice').classList.add('hide');
    tween(S, 'girlA', 0, 700);
    tween(S, 'orbA', 1, 500);
    await sleep(750);
    await fall();
    await land();
  } catch (e) { if (e !== ABORT) console.error(e); }
}
async function fall() {
  S.scene = 'fall'; S.fallPhase = 'cruise'; S.fallStart = performance.now();
  await sleep(4500); $('title').classList.add('on');
  await sleep(2000); $('tapHint').classList.add('on');
  await waitTap();
  $('tapHint').classList.remove('on'); $('title').classList.remove('on');
  S.fallPhase = 'descend'; S.descStart = performance.now();
  await sleep(3400);
}
async function land() {
  $('skip').classList.add('hide');
  $('voice').classList.add('hide'); $('chips').classList.remove('on'); $('title').classList.remove('on'); $('tapHint').classList.remove('on');
  S.orbA = 1; S.scene = 'land'; S.landStart = performance.now();
  container.classList.add('landed');
  onLanding();
  await sleep(1900);
  const c = S.choice;
  destroy();
  onLanded(c);
}
$('skip').onclick = () => {
  if (S.scene === 'land') return;
  cancelAll();
  land().catch(e => { if (e !== ABORT) console.error(e); });
};

function orb(x, y, r, a = 1) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(.14, `rgba(255,244,210,${.85 * a})`);
  g.addColorStop(.42, `rgba(255,205,130,${.22 * a})`);
  g.addColorStop(1, 'rgba(255,205,130,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 7); ctx.fill();
}

/* ---------- 場面1：暗闇 ---------- */
function drawDark(now) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 45; i++) {
    const s = stars[i], a = .04 + .12 * (.5 + .5 * Math.sin(now / 900 + s.tw));
    ctx.fillStyle = `rgba(200,210,255,${a})`; ctx.fillRect(s.x, s.y, 1.3, 1.3);
  }
  const q = Math.max(4, Math.round(Math.min(W, H) / 68));
  const gx = W / 2, gy = H * S.girlY + Math.sin(now / 1300) * q * .4;
  if (S.girlA > 0.01) {
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, q * 16);
    g.addColorStop(0, `rgba(190,180,230,${.13 * S.girlA})`); g.addColorStop(1, 'rgba(170,180,255,0)');
    ctx.fillStyle = g; ctx.fillRect(gx - q * 16, gy - q * 16, q * 32, q * 32);
  }
  girlEl.style.opacity = S.girlA;
  girlEl.style.top = (S.girlY * 100) + '%';
  girlEl.style.transform = `translate(-50%, calc(-50% + ${Math.sin(now / 1300) * 2}px))`;
  orb(W / 2, H * S.girlY + 10 + (1 - S.orbA) * q * 3, 5, S.orbA);
}

/* ---------- 場面2：落下 ---------- */
function drawFall(now, dt) {
  const e = (now - S.fallStart) / 1000;
  let v, k = 0, d = -1;
  if (S.fallPhase !== 'descend') v = e < 1.3 ? (e / 1.3) ** 2 : 1;
  else {
    d = (now - S.descStart) / 1000;
    v = Math.max(.12, 1 - d / 2.8 * .88);
    k = clamp(d / 3, 0, 1);
  }
  ctx.fillStyle = `rgb(${Math.round(14 * k)},${Math.round(20 * k)},${Math.round(51 * k)})`;
  ctx.fillRect(0, 0, W, H);
  const dx = .28, dy = .96;
  ctx.lineCap = 'round';
  for (const s of stars) {
    s.x -= dx * v * s.z * dt * 1100; s.y -= dy * v * s.z * dt * 1100;
    if (s.y < -80) { s.y = H + Math.random() * 60; s.x = Math.random() * (W + 200) - 60; }
    if (s.x < -80) s.x += W + 140;
    const len = v * s.z * s.z * 45 + 1.5;
    ctx.strokeStyle = `rgba(220,228,255,${.15 + .5 * (s.z / 1.5) ** 2})`;
    ctx.lineWidth = Math.max(.6, s.z * 1.1);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + dx * len, s.y + dy * len); ctx.stroke();
  }
  // 遠くに見えてくる焚き火の灯り
  if (d >= 0) {
    const t = clamp((d - .2) / 3, 0, 1);
    const fy = H * 1.15 - t * (H * 1.15 - H * .72), fx = W / 2 + 20 * (1 - t);
    const r = 4 + t * 34;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    g.addColorStop(0, `rgba(255,190,90,${.9 * t})`); g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, r, 0, 7); ctx.fill();
  }
  // 流れ星になった「あなた」
  const ox = W / 2 + Math.sin(now / 400) * 2, oy = H * S.girlY + 10 + (1 - (1 - clamp((e - .4) / 3.6, 0, 1)) ** 2) * (H * .5 - H * S.girlY - 10);
  const tl = 30 + v * 190;
  const g = ctx.createLinearGradient(ox, oy, ox - dx * tl, oy - dy * tl);
  g.addColorStop(0, 'rgba(255,245,215,.9)'); g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - dx * tl, oy - dy * tl); ctx.stroke();
  orb(ox, oy, 5, 1);
}

/* ---------- 場面3：着地（閃光だけ。下にアプリ本来の地図が見える） ---------- */
function drawLand(now) {
  const e = (now - S.landStart) / 1000;
  ctx.clearRect(0, 0, W, H);
  // 着地の閃光
  const flash = clamp(1 - e / 1.4, 0, 1);
  if (flash > 0) { ctx.fillStyle = `rgba(255,250,235,${flash})`; ctx.fillRect(0, 0, W, H); }
}

/* ---------- ループ ---------- */
let last = performance.now();
function frame(now) {
  if (!alive) return;
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  updTweens(now);
  if (S.scene !== 'dark') girlEl.style.opacity = 0;
  if (S.scene === 'dark') drawDark(now);
  else if (S.scene === 'fall') drawFall(now, dt);
  else drawLand(now);
  raf = requestAnimationFrame(frame);
}

/** 片付け：requestAnimationFrame・待機・イベントを止めて、画面を消す */
function destroy() {
  if (!alive) return;
  alive = false; cancelAnimationFrame(raf); cancelAll(); tweens.length = 0;
  removeEventListener('resize', resize);
  container.remove();
}

resize();
raf = requestAnimationFrame(frame);
opening();
return { destroy };
}
