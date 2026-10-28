// Device-only replacement for sync.js (used by local.html): no sign-in, no Firebase, no network.
// Same interface as sync.js; the attempt log lives in this browser's localStorage.
const STORAGE_KEY = 'localAttempts';

export const isFirebaseConfigured = true;

let attempts = [];
let notify = () => {};

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
}

export async function startSync({ onUser, onAttempts }) {
  attempts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  // Ask the browser not to evict this data when the device runs low on space
  navigator.storage?.persist?.().catch(() => {});
  notify = () => onAttempts({ attempts, pendingCount: 0, fromCache: false });
  onUser({ uid: 'local' });
  notify();
}

export function recordAttempt({ wordId, result, myAnswer, deviceId }, onError) {
  try {
    attempts.push({ wordId, result, myAnswer: String(myAnswer).slice(0, 1000), timestamp: Date.now(), deviceId });
    save();
    notify();
  } catch (error) {
    onError(error);
  }
}

export async function setNetworkEnabled() {}
export async function signIn() {}
export async function signOutUser() {}
