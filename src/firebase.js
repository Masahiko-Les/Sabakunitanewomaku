import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, writeBatch, serverTimestamp, connectFirestoreEmulator,
  query, where, orderBy, limit, startAfter, runTransaction, onSnapshot } from 'firebase/firestore';

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// 設定がなければ Firebase を使わず、試作版と同じくこのブラウザの中だけで動く
export const enabled = !!(config.apiKey && config.projectId);

let auth = null, db = null, userRef = null, myUid = null;
if (enabled) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  if (env.VITE_USE_EMULATOR === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

export { auth, db };

const USER_DEFAULTS = {
  tutorial: 0,
  metGranny: false,
  introSeen: false,
  grannyLetter: null,
  receivedToday: 0,
  receivedDate: '',
};

function currentUser() {
  return new Promise(resolve => {
    const off = onAuthStateChanged(auth, u => { off(); resolve(u); });
  });
}

/** 匿名ログインして users/{uid} を読む（なければ作る）。 */
export async function initUser() {
  if (!enabled) return null;
  const u = (await currentUser()) || (await signInAnonymously(auth)).user;
  myUid = u.uid;
  userRef = doc(db, 'users', u.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return { uid: u.uid, ...USER_DEFAULTS, ...snap.data() };
  const data = { ...USER_DEFAULTS, createdAt: serverTimestamp() };
  await setDoc(userRef, data);
  return { uid: u.uid, ...data };
}

/** users/{uid} の一部を更新する（失敗しても画面は止めない）。 */
export function saveUser(patch) {
  if (!userRef) return Promise.resolve();
  return updateDoc(userRef, patch).catch(e => console.error('[saveUser]', e));
}

/** 自分の世界（worlds/{uid}/tiles）と、そこにある種を読む。読めない種（hidden など）は除く。 */
export async function loadMyWorld() {
  if (!myUid) return null;
  const tiles = await getDocs(collection(db, 'worlds', myUid, 'tiles'));
  const list = await Promise.all(tiles.docs.map(async t => {
    const tile = t.data();
    try {
      const s = await getDoc(doc(db, 'seeds', tile.seedId));
      return s.exists() ? { tile, seed: { id: s.id, ...s.data() } } : null;
    } catch (e) { return null; }
  }));
  return list.filter(Boolean);
}

/**
 * 種を蒔く：seeds/{id} と worlds/{uid}/tiles/{id} を 1 つのバッチで書く。
 * id はすぐ返し、書き込みは裏で行う（画面は試作版と同じくすぐ進む）。
 */
export function plantSeed({ x, y, h, f, flower, hidden }) {
  if (!myUid) return { id: null, done: Promise.resolve() };
  const ref = doc(collection(db, 'seeds'));
  const batch = writeBatch(db);
  batch.set(ref, {
    ownerUid: myUid, h, f, flower,
    createdAt: serverTimestamp(),
    status: hidden ? 'hidden' : 'public',
    open: !hidden,
    deliveredCount: 0,
    deliveredTo: [],
  });
  batch.set(doc(db, 'worlds', myUid, 'tiles', ref.id), {
    seedId: ref.id, x, y, kind: 'own', placedAt: serverTimestamp(),
  });
  const done = batch.commit().catch(e => console.error('[plantSeed]', e));
  return { id: ref.id, done };
}

/**
 * 配達：まだ届け先が 5 未満の公開中の種を、古い順に探す。
 * 自分の種・すでに自分に届いている種・exclude にある種は除く。
 */
export async function findDeliverable(exclude, want, pageSize = 20, maxPages = 5) {
  if (!myUid || want <= 0) return [];
  const out = [];
  let cursor = null;
  for (let p = 0; p < maxPages && out.length < want; p++) {
    let q = query(collection(db, 'seeds'), where('status', '==', 'public'), where('open', '==', true),
      orderBy('createdAt', 'asc'), limit(pageSize));
    if (cursor) q = query(q, startAfter(cursor));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const s = d.data();
      if (s.ownerUid === myUid || (s.deliveredTo || []).includes(myUid) || exclude.has(d.id)) continue;
      out.push(d.id);
      if (out.length >= want) break;
    }
    if (snap.size < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/**
 * 配達：種を 1 つ、トランザクションで受け取る。
 * 種の deliveredCount/deliveredTo/open、自分の世界のタイル、1 日の受け取り数を同時に書く。
 * 受け取れなかったとき（もう 5 人に届いた・上限に達した など）は null。
 */
export function receiveSeed(seedId, x, y, today, dailyMax) {
  if (!myUid) return Promise.resolve(null);
  const sref = doc(db, 'seeds', seedId);
  return runTransaction(db, async tx => {
    // 締め切られた種は、届いていない人には読めない（ルール）。その種はもう受け取れないので、やり直さずにあきらめる
    let ss;
    try { ss = await tx.get(sref); } catch (e) { if (e.code === 'permission-denied') return null; throw e; }
    const us = await tx.get(userRef);
    if (!ss.exists() || !us.exists()) return null;
    const s = ss.data(), u = us.data();
    const to = s.deliveredTo || [];
    if (s.status !== 'public' || !s.open || s.ownerUid === myUid || to.includes(myUid) || s.deliveredCount >= 5) return null;
    const count = u.receivedDate === today ? (u.receivedToday || 0) : 0;
    if (count >= dailyMax) return null;
    const n = s.deliveredCount + 1;
    tx.update(sref, { deliveredCount: n, deliveredTo: [...to, myUid], open: n < 5 });
    tx.set(doc(db, 'worlds', myUid, 'tiles', seedId), { seedId, x, y, kind: 'received', placedAt: serverTimestamp() });
    tx.update(userRef, { receivedToday: count + 1, receivedDate: today });
    return { seed: { id: seedId, ...s }, count: count + 1 };
  });
}

/* ---------- 手紙とありがとう（seeds/{seedId}/letters/{書いた人の uid}） ---------- */
export const getUid = () => myUid;
const letterOf = d => {
  const x = d.data({ serverTimestamps: 'estimate' });
  return { id: d.id, writerUid: x.writerUid, text: x.text, t: x.createdAt?.toMillis?.() || Date.now(),
    thanked: !!x.thanked, thankedAt: x.thankedAt?.toMillis?.() || 0 };
};

/** 自分の種に届いた手紙を見張る（蒔いた人だけが読める）。cb(letters, isFirst) */
export function watchLetters(seedId, cb) {
  if (!myUid) return () => {};
  let first = true;
  return onSnapshot(collection(db, 'seeds', seedId, 'letters'), snap => {
    cb(snap.docs.map(letterOf), first); first = false;
  }, e => console.error('[watchLetters]', e));
}

/** 自分がほかの種に書いた手紙を見張る（ありがとうが返ってくるのを待つ）。cb(letter|null, isFirst) */
export function watchMyLetter(seedId, cb) {
  if (!myUid) return () => {};
  let first = true;
  return onSnapshot(doc(db, 'seeds', seedId, 'letters', myUid), snap => {
    cb(snap.exists() ? letterOf(snap) : null, first); first = false;
  }, e => console.error('[watchMyLetter]', e));
}

/** 手紙を書く（1 つの種に 1 人 1 回。ドキュメント ID が自分の uid）。 */
export function writeLetter(seedId, text) {
  if (!myUid) return Promise.resolve();
  return setDoc(doc(db, 'seeds', seedId, 'letters', myUid),
    { writerUid: myUid, text, createdAt: serverTimestamp(), thanked: false, thankedAt: null })
    .catch(e => console.error('[writeLetter]', e));
}

/** ありがとうを返す（蒔いた人だけ。取り消しはできない）。 */
export function thankLetter(seedId, writerUid) {
  if (!myUid) return Promise.resolve();
  return updateDoc(doc(db, 'seeds', seedId, 'letters', writerUid), { thanked: true, thankedAt: serverTimestamp() })
    .catch(e => console.error('[thankLetter]', e));
}
