// ルール確認：配達（5 つの世界へ・1 日 3 つまで・ずるの拒否）。前提：Emulator が動いていること（npm run test:rules）
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { client, plant, deliver, adminPatch, expect, done } from './rules-lib.mjs';

const [A, B, C] = await Promise.all(['A', 'B', 'C'].map(client));
const tile = id => ({ seedId: id, x: 52, y: 53, kind: 'received', placedAt: serverTimestamp() });

const s1 = await plant(A);
await expect(false, '種を更新せずに、届いたタイルだけ置く', () => setDoc(doc(B.db, 'worlds', B.uid, 'tiles', s1), tile(s1)));
await expect(false, 'タイルを置かずに、種の枠だけ使う', () => deliver(B, s1, { withTile: false }));
await expect(false, '一度に 2 つ数を増やす', () => deliver(B, s1, { seedPatch: s => ({ deliveredCount: s.deliveredCount + 2 }) }));
await expect(false, 'ほかの人の uid で受け取る', () => deliver(B, s1, { seedPatch: s => ({ deliveredTo: [...s.deliveredTo, C.uid] }) }));
await expect(false, 'まだ 5 未満なのに締め切る', () => deliver(B, s1, { seedPatch: () => ({ open: false }) }));
await expect(false, '種の本文を書き換えながら受け取る', () => deliver(B, s1, { seedPatch: () => ({ h: '書き換え' }) }));
await expect(false, 'ほかの人の世界にタイルを置いて受け取る', () => deliver(B, s1, { tileOwner: C.uid }));
await expect(false, '自分の種を自分で受け取る', () => deliver(A, s1));
await expect(false, '1 日の受け取り数を数えずに受け取る', () => deliver(B, s1, { withUser: false }));
await expect(false, '1 日の受け取り数を 2 つ増やして受け取る', () => deliver(B, s1, { userPatch: u => ({ receivedToday: 2 }) }));
await expect(true, 'B が正しく受け取る', () => deliver(B, s1));
await expect(false, 'B が同じ種をもう一度受け取る', () => deliver(B, s1));
await expect(false, '届いたタイルを動かす', () => updateDoc(doc(B.db, 'worlds', B.uid, 'tiles', s1), { x: 10 }));

const hid = await plant(A, { status: 'hidden', open: false });
await expect(false, 'hidden の種を受け取る', () => deliver(B, hid, { seedPatch: () => ({ open: true }) }));

// 受け入れ条件：A の種は、A 以外のちょうど 5 つの世界に届き、6 つ目には届かない
const full = await plant(A);
const five = await Promise.all(['D', 'E', 'F', 'G', 'H'].map(client));
for (const [i, o] of five.entries()) await expect(true, `${i + 1} つ目の世界（${o.name}）に届く`, () => deliver(o, full));
await expect(false, '5 つの世界に届いたあとの 6 人目', () => deliver(C, full, { seedPatch: () => ({ open: true }) }));
await expect(false, '5 つの世界に届いたあとの 6 人目（open のまま）', () => deliver(C, full, { seedPatch: () => ({ open: false }) }));

// 1 日 3 つまで（B はもう 1 つ受け取っている）
const more = [await plant(A), await plant(A), await plant(A)];
await expect(true, 'B が今日 2 つ目を受け取る', () => deliver(B, more[0]));
await expect(true, 'B が今日 3 つ目を受け取る', () => deliver(B, more[1]));
await expect(false, 'B が今日 4 つ目を受け取る', () => deliver(B, more[2]));
await expect(false, 'B が受け取り数を 0 に戻す', () => updateDoc(doc(B.db, 'users', B.uid), { receivedToday: 0 }));
await expect(false, 'B が日付を過去に戻して数え直す', () => deliver(B, more[2], { date: '2020-01-01' }));
await expect(false, 'B が日付を遠い未来にして数え直す', () => deliver(B, more[2], { date: '2999-01-01' }));
await expect(false, 'B が日付を遠い未来に書き換える', () => updateDoc(doc(B.db, 'users', B.uid), { receivedDate: '2999-01-01', receivedToday: 0 }));
// 日付が変われば、また受け取れる。B の記録を「昨日 3 つ受け取った」にして確かめる
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
await adminPatch(`users/${B.uid}`, { receivedDate: { stringValue: ymd(Date.now() - 86400000) }, receivedToday: { integerValue: 3 } });
await expect(true, '日付が変わったら、1 から数え直して受け取れる', () => deliver(B, more[2], { date: ymd(Date.now()) }));

done();
