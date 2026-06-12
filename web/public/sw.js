// Minimal service worker — enables install + an offline app-shell fallback.
// It only intercepts top-level navigations; all API/asset requests pass through
// untouched (network-first so the app always updates when online).
const SHELL = 'diwtkn-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add('/')).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.mode !== 'navigate') return
  event.respondWith(fetch(req).catch(() => caches.match('/')))
})
