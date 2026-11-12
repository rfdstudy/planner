/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync, execSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = join(projectRoot, 'package.json')
const lockPath = join(projectRoot, 'package-lock.json')
const releaseDir = join(projectRoot, 'release')
const INSTALLER_NAME = 'Planner-Setup.exe'
const PRECEDENT_DIRECTORY = 'precedent'

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

/**
 * Conserve l'installateur courant dans precedent/, puis vide release/ en
 * gardant ce dossier. Utilisé avant le nouveau build.
 */
export function prepareReleaseDirectory(directory = releaseDir) {
  mkdirSync(directory, { recursive: true })

  const currentInstaller = join(directory, INSTALLER_NAME)

  if (existsSync(currentInstaller)) {
    const precedentDirectory = join(directory, PRECEDENT_DIRECTORY)
    mkdirSync(precedentDirectory, { recursive: true })
    cpSync(currentInstaller, join(precedentDirectory, INSTALLER_NAME), { force: true })
  }

  for (const entry of readdirSync(directory)) {
    if (entry === PRECEDENT_DIRECTORY) continue

    rmSync(join(directory, entry), { recursive: true, force: true })
  }
}

/**
 * Après electron-builder, ne laisse que l'installateur et l'installateur
 * précédent. Supprime win-unpacked, les fichiers YAML et les artefacts annexes.
 */
export function cleanReleaseDirectory(directory = releaseDir) {
  if (!existsSync(directory)) return

  for (const entry of readdirSync(directory)) {
    if (entry === INSTALLER_NAME || entry === PRECEDENT_DIRECTORY) continue

    rmSync(join(directory, entry), { recursive: true, force: true })
  }
}

function openInstaller(installerPath) {
  const command =
    process.platform === 'win32'
      ? ['cmd.exe', ['/c', 'start', '', installerPath]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [installerPath]]

  try {
    execFileSync(command[0], command[1], { stdio: 'ignore' })
  } catch {
    console.warn('release: impossible d’ouvrir l’installateur automatiquement.')
  }
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
    prepareReleaseDirectory()
  } catch {
    fail('impossible de préparer le dossier release. Fermez Planner puis réessayez.')
  }

  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
    execSync('npm run dist', { cwd: projectRoot, stdio: 'inherit' })
  } catch {
    fail(
      `le build ou la création de l’installateur a échoué. La version ${nextVersion} reste inscrite dans package.json.`
    )
  }

  try {
    cleanReleaseDirectory()
  } catch {
    fail('impossible de nettoyer le dossier release. Fermez Planner puis réessayez.')
  }

  const installerPath = join(releaseDir, INSTALLER_NAME)

  if (!existsSync(installerPath)) {
    fail(`installateur introuvable : ${installerPath}`)
  }

  console.log(`\nNouvelle version : ${nextVersion}`)
  console.log(`Installateur : ${installerPath}`)

  openInstaller(installerPath)
}

const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1])

if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
}
