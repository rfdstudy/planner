/* eslint-disable @typescript-eslint/explicit-function-return-type */
/*
 * Service worker de Planner téléphone.
 *
 * La version du cache est remplacée au moment du build : chaque déploiement
 * installe donc un nouveau cache et supprime l'ancien. Les navigations sont
 * servies par le réseau en priorité ; hors ligne, la coquille en cache prend
 * le relais. Les fichiers de build (JS et CSS hachés) sont mis en cache à la
 * première visite.
 */
const CACHE_NAME = 'planner-phone-__PHONE_CACHE_VERSION__'
const BUILD_ASSETS = ['__PHONE_PRECACHE_ASSETS__']
const SHELL_FILES = [
  './',
  './index.html',
  './phone.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  ...BUILD_ASSETS
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('planner-phone-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(serveNavigation(request))
    return
  }

  event.respondWith(serveAsset(request))
})

async function serveNavigation(request) {
  try {
    const response = await fetch(request)

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }

    return response
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match('./phone.html')) ||
      (await caches.match('./index.html')) ||
      Response.error()
    )
  }
}

async function serveAsset(request) {
  const cached = await caches.match(request)

  if (cached !== undefined) return cached

  try {
    const response = await fetch(request)

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }

    return response
  } catch {
    return Response.error()
  }
}
