// フェーズ4確認用：配達（5 つの世界へ・1 日 3 つまで・hidden は配達しない）
// 前提：npm run emulators と、.env.local で VITE_USE_EMULATOR=true にした npm run dev が動いていること
// 6 つのブラウザ（B〜G）が「同時に」アプリを開き、トランザクションの取り合いも確かめる。
import { chromium } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';

const URL = 'http://localhost:5173';
const BASE = 'http://127.0.0.1:8080';
const FS = `${BASE}/v1/projects/demo-sabaku/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' };

const val = x => x == null ? undefined : 'integerValue' in x ? Number(x.integerValue) : 'booleanValue' in x ? x.booleanValue
  : 'stringValue' in x ? x.stringValue : 'nullValue' in x ? null : 'timestampValue' in x ? x.timestampValue
  : 'arrayValue' in x ? (x.arrayValue.values || []).map(val) : x;
const plain = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)]));
const getJSON = async p => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); return r.ok ? plain(await r.json()) : null; };
const list = async p => ((await (await fetch(`${FS}/${p}?pageSize=300`, { headers: OWNER })).json()).documents || [])
  .map(d => ({ id: d.name.split('/').pop(), ...plain(d) }));

let failed = false;
const check = (c, m) => { console.log(c ? 'OK:' : 'NG:', m); if (!c) failed = true; };

// まっさらな Emulator から始める
await fetch(`${BASE}/emulator/v1/projects/demo-sabaku/databases/(default)/documents`, { method: 'DELETE' });

// A：種を蒔く人（SDK で直接）
const appA = initializeApp({ apiKey: 'demo-key', projectId: 'demo-sabaku' }, 'A');
const authA = getAuth(appA); connectAuthEmulator(authA, 'http://127.0.0.1:9099', { disableWarnings: true });
const dbA = getFirestore(appA); connectFirestoreEmulator(dbA, '127.0.0.1', 8080);
const A = (await signInAnonymously(authA)).user.uid;
let px = 0;
async function plantA(h, hidden = false) {
  const ref = doc(collection(dbA, 'seeds')), b = writeBatch(dbA);
  b.set(ref, { ownerUid: A, h, f: '向き合っている', flower: 1, createdAt: serverTimestamp(),
    status: hidden ? 'hidden' : 'public', open: !hidden, deliveredCount: 0, deliveredTo: [] });
  b.set(doc(dbA, 'worlds', A, 'tiles', ref.id), { seedId: ref.id, x: 10 + px++, y: 10, kind: 'own', placedAt: serverTimestamp() });
  await b.commit();
  await new Promise(r => setTimeout(r, 30)); // createdAt の順をはっきりさせる
  return ref.id;
}

const browser = await chromium.launch();
const names = ['B', 'C', 'D', 'E', 'F', 'G'];
const pages = await Promise.all(names.map(async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[dbg]')) console.log('[console]', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  return page;
}));
const uidOf = page => page.evaluate(() => new Promise(res => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => { const a = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    a.onsuccess = () => res(a.result.find(r => r.value?.uid)?.value.uid || null); };
  req.onerror = () => res(null);
}));
const received = async uid => (await list(`worlds/${uid}/tiles`)).filter(t => t.kind === 'received');
async function settle(uids, ms = 30000) { // 配達が落ち着くまで待つ（3 秒間変化がなければ終わり。再試行の待ちは最大 2 秒ほど）
  let prev = -1, stable = 0;
  for (let t = 0; t < ms; t += 500) {
    const n = (await Promise.all(uids.map(received))).reduce((a, x) => a + x.length, 0);
    stable = n === prev ? stable + 500 : 0; prev = n;
    if (stable >= 3000 && t >= 3000) return;
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── 1. 受け入れ条件：A の種 1 つが、A 以外のちょうど 5 つの世界に届き、6 つ目には届かない
const Q = await plantA('ひとつめの種');
await Promise.all(pages.map(p => p.goto(URL, { waitUntil: 'load' })));
await Promise.all(pages.map(p => p.waitForFunction(() => document.querySelector('#btnPlant').textContent.length > 0)));
const uids = await Promise.all(pages.map(uidOf));
await settle(uids);
let q = await getJSON(`seeds/${Q}`);
check(q.deliveredCount === 5 && q.deliveredTo.length === 5 && new Set(q.deliveredTo).size === 5 && q.open === false,
  `種は 5 つの世界に届き、締め切られた（deliveredCount=${q.deliveredCount}, open=${q.open}）`);
check(!q.deliveredTo.includes(A), '蒔いた本人には届かない');
const holders = [];
for (const [i, u] of uids.entries()) if ((await received(u)).some(t => t.seedId === Q)) holders.push(names[i]);
check(holders.length === 5, `タイルを持つ世界も 5 つ（${holders.join(',')}）。届かなかった世界：${names.filter(n => !holders.includes(n)).join(',')}`);
check(q.deliveredTo.every(u => uids.includes(u)) && holders.every(n => q.deliveredTo.includes(uids[names.indexOf(n)])), 'deliveredTo とタイルが一致');

// ── 2. 1 日 3 つまで・hidden は配達しない・取り合いでも 5 を超えない
const P = [];
for (let i = 0; i < 4; i++) P.push(await plantA(`種 P${i + 1}`));
const H = await plantA('もう消えたいと思う日がある。', true);
await Promise.all(pages.map(p => p.reload({ waitUntil: 'load' })));
await settle(uids, 12000);

const per = await Promise.all(uids.map(received));
const openNow = (await Promise.all([Q, ...P].map(async id => ({ id, ...(await getJSON(`seeds/${id}`)) })))).filter(s => s.open);
for (const [i, r] of per.entries()) {
  const u = await getJSON(`users/${uids[i]}`);
  // 3 つ受け取ったか、そうでなければ、まだ受け取れる種がもう残っていない（古い順なので先に埋まることがある）
  const left = openNow.filter(s => !s.deliveredTo.includes(uids[i])).length;
  check(r.length === u.receivedToday && r.length <= 3 && (r.length === 3 || left === 0),
    `${names[i]}：今日 ${r.length} つ受け取った（receivedToday ${u.receivedToday}、まだ受け取れる種 ${left}）`);
}
let total = 0;
for (const id of [Q, ...P]) {
  const s = await getJSON(`seeds/${id}`);
  const tiles = per.flat().filter(t => t.seedId === id).length;
  total += s.deliveredCount;
  check(s.deliveredCount <= 5 && s.deliveredCount === s.deliveredTo.length && new Set(s.deliveredTo).size === s.deliveredTo.length
    && tiles === s.deliveredCount && s.open === (s.deliveredCount < 5),
    `${s.h}：届いた数 ${s.deliveredCount}、タイル ${tiles}、open=${s.open}`);
}
check(total === per.flat().length, `配達の合計とタイルの合計が一致（${total}）`);
const h = await getJSON(`seeds/${H}`);
check(h.deliveredCount === 0 && per.flat().every(t => t.seedId !== H), 'hidden の種はどこにも届かない');

// ── 3. 配置：村の中心部・飾り・ほかの種と重ならない（同じ世界の中で重複なし）
for (const [i, r] of per.entries()) {
  const keys = r.map(t => `${t.x},${t.y}`);
  const core = r.some(t => Math.hypot(t.x + .5 - 50, t.y + .5 - 49.6) <= 2.6);
  check(new Set(keys).size === keys.length && !core, `${names[i]} の世界：重なりなし・村の中心部なし（${keys.join(' ')}）`);
}

// ── 4. 届いた種は、再読み込み後も画面に描かれている（G の世界を撮る）
await pages[5].reload({ waitUntil: 'load' });
await pages[5].waitForTimeout(2500);
await pages[5].evaluate(() => document.querySelector('.scrim').click()); await pages[5].waitForTimeout(600);
await pages[5].screenshot({ path: 'screenshots/p4_world_G.png' });

await browser.close();
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
