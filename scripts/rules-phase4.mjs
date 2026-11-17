// フェーズ4のルール確認（配達のずる・まちがいが拒否されるか）。前提：npm run emulators が動いていること
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, collection, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore';

async function client(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-sabaku' }, name);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { db, uid: (await signInAnonymously(auth)).user.uid };
}
const A = await client('A'), B = await client('B'), C = await client('C');

async function plant(c, o = {}) {
  const ref = doc(collection(c.db, 'seeds')), b = writeBatch(c.db);
  b.set(ref, { ownerUid: c.uid, h: 'つらい', f: '向き合っている', flower: 1, createdAt: serverTimestamp(),
    status: 'public', open: true, deliveredCount: 0, deliveredTo: [], ...o });
  b.set(doc(c.db, 'worlds', c.uid, 'tiles', ref.id), { seedId: ref.id, x: 51, y: 53, kind: 'own', placedAt: serverTimestamp() });
  await b.commit();
  return ref.id;
}
const tile = id => ({ seedId: id, x: 52, y: 53, kind: 'received', placedAt: serverTimestamp() });
// 正しい受け取り方（アプリと同じ）を、中身を変えて試す
function deliver(c, id, seedPatch, { withTile = true, tileOwner = c.uid } = {}) {
  return runTransaction(c.db, async tx => {
    const s = (await tx.get(doc(c.db, 'seeds', id))).data();
    const n = s.deliveredCount + 1;
    tx.update(doc(c.db, 'seeds', id), { deliveredCount: n, deliveredTo: [...s.deliveredTo, c.uid], open: n < 5, ...seedPatch(s) });
    if (withTile) tx.set(doc(c.db, 'worlds', tileOwner, 'tiles', id), tile(id));
  }, { maxAttempts: 1 });
}

let failed = false;
async function expect(ok, label, fn) {
  let got; try { await fn(); got = true; } catch (e) { got = false; if (e.code !== 'permission-denied') console.log('  ', e.code, e.message); }
  console.log(got === ok ? 'OK:' : 'NG:', `${ok ? '許可' : '拒否'}されるべき：${label}`); if (got !== ok) failed = true;
}

const s1 = await plant(A);
await expect(false, '種を更新せずに、届いたタイルだけ置く', () => setDoc(doc(B.db, 'worlds', B.uid, 'tiles', s1), tile(s1)));
await expect(false, 'タイルを置かずに、種の枠だけ使う', () => deliver(B, s1, () => ({}), { withTile: false }));
await expect(false, '一度に 2 つ数を増やす', () => deliver(B, s1, s => ({ deliveredCount: s.deliveredCount + 2 })));
await expect(false, 'ほかの人の uid で受け取る', () => deliver(B, s1, s => ({ deliveredTo: [...s.deliveredTo, C.uid] })));
await expect(false, 'まだ 5 未満なのに締め切る', () => deliver(B, s1, () => ({ open: false })));
await expect(false, '種の本文を書き換えながら受け取る', () => deliver(B, s1, () => ({ h: '書き換え' })));
await expect(false, 'ほかの人の世界にタイルを置いて受け取る', () => deliver(B, s1, () => ({}), { tileOwner: C.uid }));
await expect(false, '自分の種を自分で受け取る', () => deliver(A, s1, () => ({})));
await expect(true, 'B が正しく受け取る', () => deliver(B, s1, () => ({})));
await expect(false, 'B が同じ種をもう一度受け取る', () => deliver(B, s1, () => ({})));
await expect(false, '届いたタイルを動かす', () => updateDoc(doc(B.db, 'worlds', B.uid, 'tiles', s1), { x: 10 }));

const hid = await plant(A, { status: 'hidden', open: false });
await expect(false, 'hidden の種を受け取る', () => deliver(B, hid, () => ({ open: true })));

const full = await plant(A);
const others = await Promise.all(['D', 'E', 'F', 'G', 'H'].map(client));
for (const o of others) await deliver(o, full, () => ({}));
await expect(false, '5 つの世界に届いたあとの 6 人目', () => deliver(C, full, () => ({ open: true })));
await expect(false, '5 つの世界に届いたあとの 6 人目（open のまま）', () => deliver(C, full, s => ({ open: false })));

console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
