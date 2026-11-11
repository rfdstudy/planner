/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = join(projectRoot, 'package.json')
const lockPath = join(projectRoot, 'package-lock.json')
const releaseDir = join(projectRoot, 'release')

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

/**
 * Calcule la prochaine version.
 * Sans argument : incrémente le dernier chiffre (patch).
 * Arguments acceptés : x.y.z, patch, minor, major ou un numéro de correctif.
 */
export function computeNextVersion(currentVersion, argument) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion)

  if (match === null) {
    fail(`version actuelle invalide dans package.json : « ${currentVersion} ».`)
  }

  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  const value = argument?.trim()

  if (value === undefined || value === '' || value === 'patch') {
    return `${major}.${minor}.${patch + 1}`
  }

  if (value === 'minor') {
    return `${major}.${minor + 1}.0`
  }

  if (value === 'major') {
    return `${major + 1}.0.0`
  }

  if (/^\d+$/.test(value)) {
    return `${major}.${minor}.${Number(value)}`
  }

  const exact = value.replace(/^v/, '')

  if (/^\d+\.\d+\.\d+$/.test(exact)) {
    return exact
  }

  fail(
    `version invalide « ${argument} ». Utilisez x.y.z, un numéro de correctif, patch, minor ou major.`
  )
}

function writeVersion(filePath, version) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'))
  data.version = version

  if (filePath === lockPath && data.packages?.[''] !== undefined) {
    data.packages[''].version = version
  }

  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function findInstaller(version, productName) {
  const expectedName = `${productName}-${version}-setup.exe`
  const expectedPath = join(releaseDir, expectedName)

  if (existsSync(expectedPath)) return expectedPath

  const files = existsSync(releaseDir)
    ? readdirSync(releaseDir).filter((name) => name.endsWith('.exe'))
    : []

  fail(
    `installateur introuvable (${expectedName}). Fichiers .exe présents : ${
      files.length === 0 ? 'aucun' : files.join(', ')
    }.`
  )
}

function main() {
  if (!existsSync(packagePath)) {
    fail('package.json introuvable.')
  }

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  const previousVersion = packageJson.version
  const nextVersion = computeNextVersion(previousVersion, process.argv[2])

  writeVersion(packagePath, nextVersion)

  if (existsSync(lockPath)) {
    writeVersion(lockPath, nextVersion)
  }

  console.log(`release: version ${previousVersion} -> ${nextVersion}`)

  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
    execSync('npm run dist', { cwd: projectRoot, stdio: 'inherit' })
  } catch {
    fail(
      `le build ou la création de l’installateur a échoué. La version ${nextVersion} reste inscrite dans package.json.`
    )
  }

  const productName = packageJson.productName ?? packageJson.name
  const installerPath = findInstaller(nextVersion, productName)

  console.log(`\nInstallateur : ${installerPath}`)
}

const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1])

if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
}
