// ルール確認：知らせる（通報）。前提：Emulator が動いていること（npm run test:rules）
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { client, plant, deliver, expect, done } from './rules-lib.mjs';

const [A, B, C] = await Promise.all(['A', 'B', 'C'].map(client));
const S = await plant(A);
await deliver(B, S);
await setDoc(doc(B.db, 'seeds', S, 'letters', B.uid), { writerUid: B.uid, text: 'ひどい手紙', createdAt: serverTimestamp(), thanked: false, thankedAt: null });

const rep = (c, o = {}, id) => ({ id: id || `${c.uid}_${o.seedId || S}${o.kind === 'letter' ? '_' + o.writerUid : ''}`,
  data: { reporterUid: c.uid, kind: 'seed', seedId: S, writerUid: null, createdAt: serverTimestamp(), ...o } });
const seedReport = (c, o, id) => { const r = rep(c, o, id), b = writeBatch(c.db);
  b.set(doc(c.db, 'reports', r.id), r.data); b.delete(doc(c.db, 'worlds', c.uid, 'tiles', S)); return b.commit(); };
const write = (c, o, id) => { const r = rep(c, o, id); return setDoc(doc(c.db, 'reports', r.id), r.data); };

// 種
await expect(false, '自分の世界にない種を知らせる（C）', () => write(C));
await expect(false, '自分の種を「種」として知らせる（A）', () => write(A));
await expect(false, 'ほかの人の名前で知らせる', () => write(B, { reporterUid: C.uid }));
await expect(false, '決まりと違う ID で知らせる', () => write(B, {}, 'free-id'));
await expect(false, '余計な項目をつけて知らせる', () => write(B, { note: 'x' }));
await expect(true, 'B が届いた種を知らせ、自分の世界から片付ける', () => seedReport(B));
await expect(false, '片付けたあと、同じ種をもう一度知らせる', () => write(B));
await expect(false, '知らせた記録を読む', () => getDoc(doc(B.db, 'reports', `${B.uid}_${S}`)));
await expect(false, '知らせた記録を消す', () => deleteDoc(doc(B.db, 'reports', `${B.uid}_${S}`)));

// 手紙
const L = { kind: 'letter', writerUid: B.uid };
await expect(false, '蒔いた人でない人が手紙を知らせる（C）', () => write(C, L));
await expect(false, 'ない手紙を知らせる', () => write(A, { kind: 'letter', writerUid: C.uid }));
await expect(false, '自分の手紙を知らせる', () => write(A, { kind: 'letter', writerUid: A.uid }));
await expect(true, 'A が自分の種に届いた手紙を知らせ、muted に入れる', () => { const r = rep(A, L), b = writeBatch(A.db);
  b.set(doc(A.db, 'reports', r.id), r.data); b.update(doc(A.db, 'users', A.uid), { [`muted.${S}_${B.uid}`]: true }); return b.commit(); });
await expect(false, '同じ手紙を 2 度知らせる', () => write(A, L));
await expect(false, 'muted に map 以外を入れる', () => updateDoc(doc(A.db, 'users', A.uid), { muted: 'x' }));

done();
