import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, connectFirestoreEmulator } from 'firebase/firestore';

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

let auth = null, db = null, userRef = null;
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
