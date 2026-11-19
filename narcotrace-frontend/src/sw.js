import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api(?:\/|$)/],
}))

const TILE_CACHE = 'vigil-zone-map-v1'
const TILE_LIMIT = 500
const ZONE_BOUNDS = { south: 12.70, north: 13.15, west: 77.30, east: 77.90 }

function isTileInZone(url) {
  if (!url.hostname.endsWith('tile.openstreetmap.org')) return false
  const match = url.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/)
  if (!match) return false
  const [, zText, xText, yText] = match
  const z = Number(zText)
  if (z < 10 || z > 18) return false
  const n = 2 ** z
  const longitude = (Number(xText) / n) * 360 - 180
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - (2 * Number(yText)) / n))) * (180 / Math.PI)
  return latitude >= ZONE_BOUNDS.south && latitude <= ZONE_BOUNDS.north
    && longitude >= ZONE_BOUNDS.west && longitude <= ZONE_BOUNDS.east
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !isTileInZone(new URL(event.request.url))) return
  event.respondWith((async () => {
    const cache = await caches.open(TILE_CACHE)
    const cached = await cache.match(event.request)
    try {
      const response = await fetch(event.request)
      if (response.ok || response.type === 'opaque') {
        await cache.put(event.request, response.clone())
        const keys = await cache.keys()
        if (keys.length > TILE_LIMIT) {
          await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map((key) => cache.delete(key)))
        }
      }
      return response
    } catch (error) {
      if (cached) return cached
      throw error
    }
  })())
})

self.addEventListener('sync', (event) => {
  if (event.tag !== 'vigil-outbox-sync') return
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows.length === 0) throw new Error('Outbox sync is waiting for an authenticated app window.')
    windows.forEach((client) => client.postMessage({ type: 'VIGIL_OUTBOX_SYNC' }))
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
