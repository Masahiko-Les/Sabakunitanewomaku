// ルール確認：users/{uid}（講習の進み具合・見た印・見本の種への手紙・1 日の受け取り数）。前提：Emulator が動いていること（npm run test:rules）
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { client, expect, done } from './rules-lib.mjs';

const [A, B] = await Promise.all(['A', 'B'].map(client));
const U = c => doc(c.db, 'users', c.uid);

// 作る（アプリと同じ初期値は client() の中で作れている）
async function fresh() {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-sabaku' }, 'fresh-' + Math.random());
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { db, uid: (await signInAnonymously(auth)).user.uid };
}
const base = { tutorial: 0, metGranny: false, introSeen: false, grannyLetter: null, receivedToday: 0, receivedDate: '' };
const F = await fresh();
await expect(false, '最初から受け取り数を使い切った状態で作る', () => setDoc(U(F), { ...base, receivedToday: 3, createdAt: serverTimestamp() }));
await expect(false, '名前つきで作る', () => setDoc(U(F), { ...base, name: 'たろう', createdAt: serverTimestamp() }));
await expect(false, 'ほかの人の users を作る', () => setDoc(doc(F.db, 'users', 'someone-else'), { ...base, createdAt: serverTimestamp() }));
await expect(true, 'アプリと同じ初期値で作る', () => setDoc(U(F), { ...base, createdAt: serverTimestamp() }));

// 読む・消す
await expect(true, 'A が自分の users を読む', () => getDoc(U(A)));
await expect(false, 'B が A の users を読む', () => getDoc(U({ db: B.db, uid: A.uid })));
await expect(false, 'B が A の users を書き換える', () => updateDoc(doc(B.db, 'users', A.uid), { tutorial: 3 }));
await expect(false, 'A が自分の users を消す', () => deleteDoc(U(A)));

// アプリが書く内容
await expect(true, '講習を進める（tutorial 1, metGranny）', () => updateDoc(U(A), { tutorial: 1, metGranny: true }));
await expect(true, 'おばあちゃんへの手紙', () => updateDoc(U(A), { tutorial: 2, grannyLetter: 'こんにちは' }));
await expect(true, '講習を終える（tutorial 3）', () => updateDoc(U(A), { tutorial: 3 }));
await expect(true, '説明を見た（introSeen）', () => updateDoc(U(A), { introSeen: true }));
await expect(true, '種を見た印（seen.<id>）', () => updateDoc(U(A), { 'seen.abc123': Date.now() }));
await expect(true, '見本の種への手紙（sampleLetters.s3）', () => updateDoc(U(A), { 'sampleLetters.s3': { text: 'すてきです', t: Date.now(), thanked: false } }));
await expect(true, '見本の種のありがとう（sampleLetters.s3.thanked）', () => updateDoc(U(A), { 'sampleLetters.s3.thanked': true }));

// まちがい・ずる
await expect(false, 'tutorial が 4', () => updateDoc(U(A), { tutorial: 4 }));
await expect(false, 'おばあちゃんへの手紙が 301 字', () => updateDoc(U(A), { grannyLetter: 'あ'.repeat(301) }));
await expect(false, '名前を保存する', () => updateDoc(U(A), { name: 'たろう' }));
await expect(false, '作成日時を書き換える', () => updateDoc(U(A), { createdAt: serverTimestamp() }));
await expect(false, '見本にない種（s8）への手紙', () => updateDoc(U(A), { 'sampleLetters.s8': { text: 'x', t: 1, thanked: false } }));
await expect(false, '見本の種への手紙が 301 字', () => updateDoc(U(A), { 'sampleLetters.s1': { text: 'あ'.repeat(301), t: 1, thanked: false } }));
await expect(false, '見本の種への手紙に余計なフィールド', () => updateDoc(U(A), { 'sampleLetters.s1': { text: 'x', t: 1, thanked: false, to: 'B' } }));
await expect(false, '1 日の受け取り数を 4 にする', () => updateDoc(U(A), { receivedToday: 4 }));
await expect(false, '受け取りの日付の形がおかしい', () => updateDoc(U(A), { receivedDate: 'tomorrow' }));

done();
