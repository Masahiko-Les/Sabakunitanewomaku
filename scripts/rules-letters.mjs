// ルール確認：手紙とありがとう。前提：Emulator が動いていること（npm run test:rules）
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { client, plant, deliver, adminPatch, expect, done } from './rules-lib.mjs';

const [A, B, C, D] = await Promise.all(['A', 'B', 'C', 'D'].map(client));
const L = (c, id, writer = c.uid) => doc(c.db, 'seeds', id, 'letters', writer);
const letter = (c, o = {}) => ({ writerUid: c.uid, text: 'すてきですね', createdAt: serverTimestamp(), thanked: false, thankedAt: null, ...o });

const S = await plant(A);
await deliver(B, S); await deliver(D, S);

// 書く
await expect(false, '自分の世界にない種に手紙を書く（C）', () => setDoc(L(C, S), letter(C)));
await expect(false, 'ほかの人の uid で手紙を書く', () => setDoc(L(B, S, C.uid), letter(B, { writerUid: C.uid })));
await expect(false, '301 字の手紙', () => setDoc(L(B, S), letter(B, { text: 'あ'.repeat(301) })));
await expect(false, '最初からありがとう済みの手紙', () => setDoc(L(B, S), letter(B, { thanked: true, thankedAt: serverTimestamp() })));
await expect(false, '余計なフィールドつきの手紙', () => setDoc(L(B, S), letter(B, { name: 'B' })));
await expect(true, '届いた種に手紙を書く（B）', () => setDoc(L(B, S), letter(B)));
await expect(false, '同じ種に 2 通目を書く（B）', () => setDoc(L(B, S), letter(B, { text: '2通目' })));
await expect(false, '自分の手紙を書き換える（B）', () => updateDoc(L(B, S), { text: '書き換え' }));
await expect(false, '自分の手紙を消す（B）', () => deleteDoc(L(B, S)));
await expect(false, '自分の種に、自分で手紙を書く（A）', () => setDoc(L(A, S), letter(A)));
await expect(false, '自分の種に 2 通目を書く（A）', () => setDoc(L(A, S), letter(A, { text: '2通目' })));

// 読む
await expect(true, '蒔いた人が手紙を読む（A → B の手紙）', () => getDoc(L(A, S, B.uid)));
await expect(true, '蒔いた人が手紙の一覧を読む', () => getDocs(collection(A.db, 'seeds', S, 'letters')));
await expect(true, '書いた人が自分の手紙を読む（B）', () => getDoc(L(B, S)));
await expect(false, 'ほかの人の手紙を読む（D → B の手紙）', () => getDoc(L(D, S, B.uid)));
await expect(false, '蒔いた人の自分あての手紙を読む（B → A の手紙）', () => getDoc(L(B, S, A.uid)));
await expect(false, '書いた人が手紙の一覧を読む（B）', () => getDocs(collection(B.db, 'seeds', S, 'letters')));
await expect(false, '関係ない人が手紙を読む（C）', () => getDoc(L(C, S, B.uid)));

// ありがとう
await expect(false, '書いた人が自分の手紙にありがとう（B）', () => updateDoc(L(B, S), { thanked: true, thankedAt: serverTimestamp() }));
await expect(false, 'ほかの人がありがとう（D）', () => updateDoc(L(D, S, B.uid), { thanked: true, thankedAt: serverTimestamp() }));
await expect(false, '蒔いた人がありがとうと一緒に本文を変える', () => updateDoc(L(A, S, B.uid), { thanked: true, thankedAt: serverTimestamp(), text: 'x' }));
await expect(true, '蒔いた人がありがとうを返す（A → B）', () => updateDoc(L(A, S, B.uid), { thanked: true, thankedAt: serverTimestamp() }));
await expect(false, 'ありがとうを取り消す', () => updateDoc(L(A, S, B.uid), { thanked: false }));
await expect(false, 'ありがとうをもう一度返す（時刻の書き換え）', () => updateDoc(L(A, S, B.uid), { thanked: true, thankedAt: serverTimestamp() }));

// 管理者が hidden にした種には、もう書けない（タイルがあっても）
await adminPatch(`seeds/${S}`, { status: { stringValue: 'hidden' } });
await expect(false, 'hidden になった種に手紙を書く（D）', () => setDoc(L(D, S), letter(D)));

await expect(true, 'hidden になっても、蒔いた本人は自分の種の手紙を読める', () => getDocs(collection(A.db, 'seeds', S, 'letters')));

// 種と芽は、蒔いてから 1 週間で消える。手紙もありがとうも、それまで
const ago = d => ({ createdAt: { timestampValue: new Date(Date.now() - d * 86400000).toISOString() } });
const W = await plant(A);
await deliver(C, W); await deliver(D, W);
await expect(true, '6 日目：届いた種に手紙を書く（C）', async () => { await adminPatch(`seeds/${W}`, ago(6)); await setDoc(L(C, W), letter(C)); });
await expect(false, '6 日目：蒔いた人が自分に手紙を書く', () => setDoc(L(A, W), letter(A)));
await adminPatch(`seeds/${W}`, ago(7.01));
await expect(false, '1 週間を過ぎてから、届いた種に手紙を書く（D）', () => setDoc(L(D, W), letter(D)));
await expect(false, '1 週間を過ぎてから、ありがとうを返す', () => updateDoc(L(A, W, C.uid), { thanked: true, thankedAt: serverTimestamp() }));
await expect(true, '1 週間を過ぎても、蒔いた人は手紙を読める', () => getDocs(collection(A.db, 'seeds', W, 'letters')));
await expect(true, '1 週間を過ぎても、書いた人は自分の手紙を読める', () => getDoc(L(C, W)));

// 抜く：蒔いた人が、種・届いた手紙・自分のタイルをいっしょに消す
const P = await plant(A);
await deliver(B, P); await deliver(D, P);
await setDoc(L(B, P), letter(B)); await setDoc(L(D, P), letter(D));
await expect(false, 'B が A の種を抜く', () => deleteDoc(doc(B.db, 'seeds', P)));
await expect(false, 'D が B の手紙を消す', () => deleteDoc(L(D, P, B.uid)));
await expect(false, 'B が自分の手紙を消す（抜くのは蒔いた人だけ）', () => deleteDoc(L(B, P)));
await expect(true, 'A が自分の種を抜く（手紙・種・タイルを 1 つのバッチで）', async () => {
  const b = writeBatch(A.db);
  (await getDocs(collection(A.db, 'seeds', P, 'letters'))).docs.forEach(d => b.delete(d.ref));
  b.delete(doc(A.db, 'seeds', P)); b.delete(doc(A.db, 'worlds', A.uid, 'tiles', P));
  return b.commit();
});
await expect(false, '抜いたあと、届いた先（B）では種を読めない', () => getDoc(doc(B.db, 'seeds', P)));
await expect(false, '抜いたあと、B は手紙を書けない', () => setDoc(L(B, P), letter(B, { text: 'もう一度' })));

done();
