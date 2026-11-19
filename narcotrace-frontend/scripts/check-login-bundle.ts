import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const html = await readFile(path.join(dist, 'index.html'), 'utf8')
const script = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)
if (!script) throw new Error('Production index.html has no module entry.')

const assets = new Set([script[1]])
for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
  assets.add(match[1])
}

let compressedBytes = 0
for (const asset of assets) {
  const file = path.join(dist, asset.replace(/^\//, ''))
  const contents = await readFile(file)
  await stat(file)
  compressedBytes += gzipSync(contents).length
}

const compressedKiB = compressedBytes / 1024
console.log(`/login initial JavaScript: ${compressedKiB.toFixed(1)} kB gz (${assets.size} assets; budget 250 kB)`)
if (compressedBytes >= 250 * 1024) {
  throw new Error(`/login initial JavaScript exceeds the 250 kB gzip budget (${compressedKiB.toFixed(1)} kB).`)
}
