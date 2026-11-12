import { createHash } from 'node:crypto'
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDirectory = resolve('dist-phone')
const assetsDirectory = resolve(distDirectory, 'assets')
const phoneFile = resolve(distDirectory, 'phone.html')
const indexFile = resolve(distDirectory, 'index.html')
const serviceWorkerFile = resolve(distDirectory, 'sw.js')
const base = (process.env.PHONE_BASE?.trim() || '/').replace(/\/?$/, '/')

// GitHub Pages sert /depot/ avec index.html. La page phone.html reste
// accessible telle quelle ; les deux servent exactement la même application.
await copyFile(phoneFile, indexFile)

// Les noms des fichiers JS, CSS et de police sont hachés : le service worker
// doit les connaître au moment du build pour rendre l'app hors ligne dès la
// première installation.
const assetEntries = await readdir(assetsDirectory, { recursive: true, withFileTypes: true })
const assetUrls = assetEntries
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const relative = entry.parentPath === undefined ? entry.name : entry.parentPath
    const fullPath = resolve(relative, entry.name)
    return `${base}${fullPath.slice(distDirectory.length + 1).replaceAll('\\', '/')}`
  })
  .sort()

const phoneHtml = await readFile(phoneFile, 'utf8')
const cacheVersion = createHash('sha256').update(phoneHtml).digest('hex').slice(0, 16)
const serviceWorker = await readFile(serviceWorkerFile, 'utf8')
const cachePlaceholder = '__PHONE_CACHE_VERSION__'
const assetsPlaceholder = "['__PHONE_PRECACHE_ASSETS__']"

if (!serviceWorker.includes(cachePlaceholder) || !serviceWorker.includes(assetsPlaceholder)) {
  throw new Error('Le modèle du service worker ne contient pas ses jetons de build.')
}

const versionedServiceWorker = serviceWorker.replaceAll(cachePlaceholder, cacheVersion)
const precachedServiceWorker = versionedServiceWorker.replace(
  assetsPlaceholder,
  JSON.stringify(assetUrls, null, 2)
)

await writeFile(serviceWorkerFile, precachedServiceWorker, 'utf8')
await writeFile(resolve(distDirectory, '.nojekyll'), '', 'utf8')

console.log(
  `Application téléphone construite dans dist-phone (cache ${cacheVersion}, ${assetUrls.length} fichiers précachés).`
)
