// ルール確認：種を蒔く・種を読む・タイル。前提：Emulator が動いていること（npm run test:rules でまとめて実行）
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where, orderBy, limit } from 'firebase/firestore';
import { client, plant, deliver, adminPatch, expect, done } from './rules-lib.mjs';

const [A, B, C] = await Promise.all(['A', 'B', 'C'].map(client));

const seedData = (uid, o = {}) => ({ ownerUid: uid, h: 'つらい', f: '向き合っている', flower: 1, createdAt: serverTimestamp(),
  status: 'public', open: true, deliveredCount: 0, deliveredTo: [], ...o });
const tileData = (id, o = {}) => ({ seedId: id, x: 51, y: 53, kind: 'own', placedAt: serverTimestamp(), ...o });
function plantBatch(c, seed = {}, tile = {}, tileOwner = c.uid) {
  const ref = doc(collection(c.db, 'seeds')), b = writeBatch(c.db);
  b.set(ref, seedData(c.uid, seed)); b.set(doc(c.db, 'worlds', tileOwner, 'tiles', ref.id), tileData(ref.id, tile));
  return { ref, commit: () => b.commit() };
}

// 蒔く
const pub = plantBatch(A);
await expect(true, 'A が種とタイルを同時に蒔く', pub.commit);
const hid = plantBatch(A, { status: 'hidden', open: false }, { x: 49 });
await expect(true, 'A が hidden の種を蒔く', hid.commit);
await expect(false, '種だけ（タイルなし）を蒔く', () => setDoc(doc(collection(A.db, 'seeds')), seedData(A.uid)));
await expect(false, 'ownerUid を他人にして蒔く', () => { const r = doc(collection(B.db, 'seeds')), b = writeBatch(B.db);
  b.set(r, seedData(A.uid)); b.set(doc(B.db, 'worlds', B.uid, 'tiles', r.id), tileData(r.id)); return b.commit(); });
await expect(false, '他人の世界にタイルを置く', () => plantBatch(B, {}, {}, A.uid).commit());
await expect(false, '他人の種を自分の own タイルにする', () => setDoc(doc(B.db, 'worlds', B.uid, 'tiles', pub.ref.id), tileData(pub.ref.id)));
await expect(true, '② を書かずに蒔く（f は null）', () => plantBatch(A, { f: null }).commit());
await expect(true, '② を書かずに蒔く（f なし）', () => { const { f, ...rest } = seedData(A.uid); const r = doc(collection(A.db, 'seeds')), b = writeBatch(A.db);
  b.set(r, rest); b.set(doc(A.db, 'worlds', A.uid, 'tiles', r.id), tileData(r.id)); return b.commit(); });
await expect(false, 'f が空文字', () => plantBatch(A, { f: '' }).commit());
await expect(false, 'f が文字列以外', () => plantBatch(A, { f: 3 }).commit());
await expect(false, 'h が 61 字', () => plantBatch(A, { h: 'あ'.repeat(61) }).commit());
await expect(false, 'f が 241 字', () => plantBatch(A, { f: 'あ'.repeat(241) }).commit());
await expect(false, 'h が空', () => plantBatch(A, { h: '' }).commit());
await expect(false, '花の種類が範囲外', () => plantBatch(A, { flower: 5 }).commit());
await expect(false, '最初から配達済みにする', () => plantBatch(A, { deliveredCount: 1, deliveredTo: [B.uid] }).commit());
await expect(false, 'hidden なのに open=true', () => plantBatch(A, { status: 'hidden', open: true }).commit());
await expect(false, 'status が public / hidden 以外', () => plantBatch(A, { status: 'pending' }).commit());
await expect(false, '余計なフィールド', () => plantBatch(A, { nickname: 'x' }).commit());
await expect(false, '作成時刻をごまかす', () => plantBatch(A, { createdAt: new Date(2000, 0, 1) }).commit());
await expect(false, 'マスが範囲外', () => plantBatch(A, {}, { x: 100 }).commit());

// 書き換え・削除
await expect(false, 'A が自分の種を書き換える', () => updateDoc(doc(A.db, 'seeds', pub.ref.id), { h: '書き換え' }));
await expect(false, 'A が自分の種を hidden から public にする', () => updateDoc(doc(A.db, 'seeds', hid.ref.id), { status: 'public', open: true }));
await expect(false, 'A が自分の種を消す', () => deleteDoc(doc(A.db, 'seeds', pub.ref.id)));
await expect(false, 'A が自分のタイルを動かす', () => updateDoc(doc(A.db, 'worlds', A.uid, 'tiles', pub.ref.id), { x: 10 }));
await expect(false, 'B が A の世界のタイルを消す', () => deleteDoc(doc(B.db, 'worlds', A.uid, 'tiles', pub.ref.id)));

// 読む
await expect(true, 'B が A の届け先を探している種を読む（配達のため）', () => getDoc(doc(B.db, 'seeds', pub.ref.id)));
await expect(true, 'B が配達の検索をする（public・open・古い順）', () => getDocs(query(collection(B.db, 'seeds'),
  where('status', '==', 'public'), where('open', '==', true), orderBy('createdAt', 'asc'), limit(20))));
await expect(false, 'B が条件なしで種を一覧する', () => getDocs(collection(B.db, 'seeds')));
await expect(false, 'B が A の hidden の種を読む', () => getDoc(doc(B.db, 'seeds', hid.ref.id)));
await expect(true, 'A が自分の hidden の種を読む', () => getDoc(doc(A.db, 'seeds', hid.ref.id)));
await expect(false, 'B が A の世界のタイルを読む', () => getDoc(doc(B.db, 'worlds', A.uid, 'tiles', pub.ref.id)));
await expect(true, 'A が自分の世界のタイルを一覧する', () => getDocs(collection(A.db, 'worlds', A.uid, 'tiles')));

// 5 つの世界に届いて締め切られた種：届いた人は読めるが、届いていない人は読めない
const full = await plant(A);
const five = await Promise.all(['D', 'E', 'F', 'G', 'H'].map(client));
for (const o of five) await deliver(o, full);
await expect(true, '届いた人（D）が締め切られた種を読む', () => getDoc(doc(five[0].db, 'seeds', full)));
await expect(false, '届いていない人（C）が締め切られた種を読む', () => getDoc(doc(C.db, 'seeds', full)));

// 管理者が hidden にした種は、ほかの人の世界から見えなくなる（蒔いた本人には残る）
await adminPatch(`seeds/${full}`, { status: { stringValue: 'hidden' } });
await expect(false, '届いた人（D）が、管理者が hidden にした種を読む', () => getDoc(doc(five[0].db, 'seeds', full)));
await expect(true, '蒔いた本人（A）は、管理者が hidden にした種を読める', () => getDoc(doc(A.db, 'seeds', full)));

// 「すべてのデータを消す」：自分の世界のタイルは消せる。種そのものは消せない
await expect(true, 'A が自分の世界のタイルを消す（すべてのデータを消す）', () => deleteDoc(doc(A.db, 'worlds', A.uid, 'tiles', pub.ref.id)));
await expect(false, 'タイルを消したあとも、種そのものは消せない', () => deleteDoc(doc(A.db, 'seeds', pub.ref.id)));

done();
