// Offline support. Bump CACHE_VERSION whenever an app file (not vocab.json) changes:
// that is what makes installed copies download the new version.
const CACHE_VERSION = 3;
const CACHE_NAME = `french-trainer-v${CACHE_VERSION}`;
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/13.1.0';

const APP_FILES = [
  './',
  'index.html',
  'local.html',
  'style.css',
  'manifest.webmanifest',
  'local.webmanifest',
  'vocab.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/grading.js',
  'js/selection.js',
  'js/seed-progress.js',
  'js/sync.js',
  'js/local-store.js',
  'js/firebase-config.js',
  `${FIREBASE_SDK}/firebase-app.js`,
  `${FIREBASE_SDK}/firebase-auth.js`,
  `${FIREBASE_SDK}/firebase-firestore.js`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' skips the browser's HTTP cache so a new version gets fresh files
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('french-trainer-') && n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function vocabFromNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('vocab.json', response.clone());
    return response;
  } catch {
    return (await cache.match('vocab.json')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
  if (cached) return cached;
  if (request.mode === 'navigate') {
    const page = await caches.match('index.html');
    if (page) return page;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.endsWith('/vocab.json')) {
    // "?fresh=…" = the app is online and checking for a newer vocabulary
    event.respondWith(url.searchParams.has('fresh') ? vocabFromNetwork(request) : cacheFirst(new Request('vocab.json')));
    return;
  }
  if (sameOrigin || url.href.startsWith(FIREBASE_SDK)) event.respondWith(cacheFirst(request));
  // Everything else (Firestore, sign-in) goes straight to the network.
});
