// Firebase: Google sign-in + append-only attempt log in Firestore with an offline cache.
// Keep the SDK version in sync with FIREBASE_SDK in sw.js.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, addDoc, onSnapshot, enableNetwork, disableNetwork,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const isFirebaseConfigured = !String(firebaseConfig.apiKey).startsWith('REPLACE');

let auth;
let db;
let currentUser = null;
let stopListeningToAttempts = () => {};

// callbacks: onUser(user | null), onAttempts({ attempts, pendingCount, fromCache }), onError(error)
export async function startSync({ onlineMode, onUser, onAttempts, onError }) {
  const app = initializeApp(firebaseConfig);
  // No popup resolver here: the auth iframe then only loads when signing in, not on every start (works offline).
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (!onlineMode) await disableNetwork(db);

  onAuthStateChanged(auth, (user) => {
    stopListeningToAttempts();
    currentUser = user;
    onUser(user);
    if (!user) return;
    stopListeningToAttempts = onSnapshot(
      collection(db, 'users', user.uid, 'attempts'),
      { includeMetadataChanges: true },
      (snapshot) => onAttempts({
        attempts: snapshot.docs.map((d) => d.data()),
        pendingCount: snapshot.docs.filter((d) => d.metadata.hasPendingWrites).length,
        fromCache: snapshot.metadata.fromCache,
      }),
      onError,
    );
  }, onError);
}

export function signIn() {
  return signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
}

export function signOutUser() {
  return signOut(auth);
}

// Not awaited: offline, the promise only resolves once the server has the write.
// The local cache (and our snapshot listener) sees it immediately.
export function recordAttempt({ wordId, result, myAnswer, deviceId }, onError) {
  if (!currentUser) throw new Error('Not signed in: cannot save the answer');
  addDoc(collection(db, 'users', currentUser.uid, 'attempts'), {
    wordId, result, myAnswer: String(myAnswer).slice(0, 1000), timestamp: Date.now(), deviceId,
  }).catch(onError);
}

export function setNetworkEnabled(enabled) {
  return enabled ? enableNetwork(db) : disableNetwork(db);
}
