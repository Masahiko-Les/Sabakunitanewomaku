// ルールテスト共通：Emulator につないだ匿名ユーザー、アプリと同じ書き方の「蒔く」「受け取る」、許可／拒否の確認
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, collection, setDoc, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore';

export const FS = 'http://127.0.0.1:8080/v1/projects/demo-sabaku/databases/(default)/documents';
export const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

let n = 0;
/** 匿名ログインして、アプリと同じ初期値で users/{uid} を作る */
export async function client(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-sabaku' }, `${name}-${n++}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const uid = (await signInAnonymously(auth)).user.uid;
  await setDoc(doc(db, 'users', uid), { tutorial: 0, metGranny: false, introSeen: false, grannyLetter: null,
    receivedToday: 0, receivedDate: '', createdAt: serverTimestamp() });
  return { db, uid, name };
}

export const today = () => { const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export async function plant(c, o = {}, tile = {}) {
  const ref = doc(collection(c.db, 'seeds')), b = writeBatch(c.db);
  b.set(ref, { ownerUid: c.uid, h: 'つらい', f: '向き合っている', flower: 1, createdAt: serverTimestamp(),
    status: 'public', open: true, deliveredCount: 0, deliveredTo: [], ...o });
  b.set(doc(c.db, 'worlds', c.uid, 'tiles', ref.id), { seedId: ref.id, x: 51, y: 53, kind: 'own', placedAt: serverTimestamp(), ...tile });
  await b.commit();
  return ref.id;
}

/**
 * アプリ（src/firebase.js の receiveSeed）と同じ受け取り方。
 * seedPatch / userPatch / withTile / tileOwner / withUser で中身を変えて、ずるが拒否されるかを試す。
 */
export function deliver(c, id, { seedPatch = () => ({}), userPatch = () => ({}), withTile = true, tileOwner = c.uid,
  withUser = true, date = today() } = {}) {
  return runTransaction(c.db, async tx => {
    const sref = doc(c.db, 'seeds', id), uref = doc(c.db, 'users', c.uid);
    const s = (await tx.get(sref)).data(), u = (await tx.get(uref)).data();
    const k = s.deliveredCount + 1, count = (u.receivedDate === date ? u.receivedToday : 0) + 1;
    tx.update(sref, { deliveredCount: k, deliveredTo: [...s.deliveredTo, c.uid], open: k < 5, ...seedPatch(s) });
    if (withTile) tx.set(doc(c.db, 'worlds', tileOwner, 'tiles', id), { seedId: id, x: 52, y: 53, kind: 'received', placedAt: serverTimestamp() });
    if (withUser) tx.update(uref, { receivedToday: count, receivedDate: date, ...userPatch(u) });
  }, { maxAttempts: 1 });
}

/** 管理者（Firebase コンソール）の代わりに、ルールを通さず書き換える */
export const adminPatch = (path, fields) => fetch(`${FS}/${path}?${Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&')}`,
  { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });

let failed = false;
export async function expect(ok, label, fn) {
  let got; try { await fn(); got = true; } catch (e) { got = false; if (e.code !== 'permission-denied') console.log('  ', e.code, e.message); }
  console.log(got === ok ? 'OK:' : 'NG:', `${ok ? '許可' : '拒否'}されるべき：${label}`); if (got !== ok) failed = true;
}
export function done() { console.log(failed ? 'FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0); }
