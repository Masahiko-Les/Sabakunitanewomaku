// フェーズ3のルール確認（Emulator）。本格的なテストはフェーズ6で @firebase/rules-unit-testing にまとめる。
// 前提：npm run emulators が動いていること
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, collection, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

async function client(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-sabaku' }, name);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const { user } = await signInAnonymously(auth);
  return { db, uid: user.uid };
}
const A = await client('A'), B = await client('B');

const seedData = (uid, o = {}) => ({ ownerUid: uid, h: 'つらい', f: '向き合っている', flower: 1, createdAt: serverTimestamp(),
  status: 'public', open: true, deliveredCount: 0, deliveredTo: [], ...o });
const tileData = (id, o = {}) => ({ seedId: id, x: 51, y: 53, kind: 'own', placedAt: serverTimestamp(), ...o });
function plantBatch(c, seed = {}, tile = {}, tileOwner = c.uid) {
  const ref = doc(collection(c.db, 'seeds')), b = writeBatch(c.db);
  b.set(ref, seedData(c.uid, seed)); b.set(doc(c.db, 'worlds', tileOwner, 'tiles', ref.id), tileData(ref.id, tile));
  return { ref, commit: () => b.commit() };
}

let failed = false;
async function expect(ok, label, fn) {
  let got;
  try { await fn(); got = true; } catch (e) { got = false; if (e.code !== 'permission-denied') console.log('  ', e.code, e.message); }
  console.log(got === ok ? 'OK:' : 'NG:', `${ok ? '許可' : '拒否'}されるべき：${label}`); if (got !== ok) failed = true;
}

const pub = plantBatch(A);
await expect(true, 'A が種とタイルを同時に蒔く', pub.commit);
const hid = plantBatch(A, { status: 'hidden', open: false }, { x: 49 });
await expect(true, 'A が hidden の種を蒔く', hid.commit);

await expect(false, '種だけ（タイルなし）を蒔く', () => setDoc(doc(collection(A.db, 'seeds')), seedData(A.uid)));
await expect(false, 'ownerUid を他人にして蒔く', () => { const r = doc(collection(B.db, 'seeds')), b = writeBatch(B.db);
  b.set(r, seedData(A.uid)); b.set(doc(B.db, 'worlds', B.uid, 'tiles', r.id), tileData(r.id)); return b.commit(); });
await expect(false, '他人の世界にタイルを置く', () => plantBatch(B, {}, {}, A.uid).commit());
await expect(false, '他人の種を自分の own タイルにする', () => setDoc(doc(B.db, 'worlds', B.uid, 'tiles', pub.ref.id), tileData(pub.ref.id)));
await expect(false, 'h が 61 字', () => plantBatch(A, { h: 'あ'.repeat(61) }).commit());
await expect(false, 'f が 241 字', () => plantBatch(A, { f: 'あ'.repeat(241) }).commit());
await expect(false, '最初から配達済みにする', () => plantBatch(A, { deliveredCount: 1, deliveredTo: [B.uid] }).commit());
await expect(false, 'hidden なのに open=true', () => plantBatch(A, { status: 'hidden', open: true }).commit());
await expect(false, '余計なフィールド', () => plantBatch(A, { nickname: 'x' }).commit());
await expect(false, 'マスが範囲外', () => plantBatch(A, {}, { x: 100 }).commit());

await expect(true, 'B が A の公開中の種を読む', () => getDoc(doc(B.db, 'seeds', pub.ref.id)));
await expect(false, 'B が A の hidden の種を読む', () => getDoc(doc(B.db, 'seeds', hid.ref.id)));
await expect(true, 'A が自分の hidden の種を読む', () => getDoc(doc(A.db, 'seeds', hid.ref.id)));
await expect(false, 'B が A の世界のタイルを読む', () => getDoc(doc(B.db, 'worlds', A.uid, 'tiles', pub.ref.id)));
await expect(false, 'A が自分の種を書き換える', () => updateDoc(doc(A.db, 'seeds', pub.ref.id), { h: '書き換え' }));
await expect(false, 'A が自分の種を消す', () => deleteDoc(doc(A.db, 'seeds', pub.ref.id)));
await expect(false, 'A が自分のタイルを動かす', () => updateDoc(doc(A.db, 'worlds', A.uid, 'tiles', pub.ref.id), { x: 10 }));
await expect(false, 'B が A のユーザー情報を読む', () => getDoc(doc(B.db, 'users', A.uid)));

console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
