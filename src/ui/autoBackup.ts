import Dexie from 'dexie'
import { createBackup, serializeBackup } from '../db/backup'
import { repositories } from '../db/repositories'
import { platform } from '../platform'

const INITIAL_DELAY_MS = 15_000
const CHANGE_DEBOUNCE_MS = 60_000
const RETRY_DELAY_MS = 5 * 60_000
const INTERVAL_MS = 10 * 60_000

/**
 * Sauvegarde automatique dans Electron.
 *
 * Une première copie est écrite peu après le démarrage, puis après chaque
 * série de modifications (une minute de calme) et au plus toutes les dix
 * minutes. Le processus principal conserve les cinq fichiers les plus récents.
 * Dans le navigateur, la fonction ne fait rien.
 */
export function startAutoBackup(): () => void {
  if (platform.kind !== 'electron') {
    return () => undefined
  }

  let dirty = true
  let running = false
  let stopped = false
  let debounceTimer: number | null = null

  const clearDebounce = (): void => {
    if (debounceTimer === null) return
    window.clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const schedule = (delayMs: number, run: () => void): void => {
    if (stopped || running) return
    clearDebounce()
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null
      run()
    }, delayMs)
  }

  const runBackup = async (): Promise<void> => {
    if (stopped || running || !dirty) return

    running = true

    try {
      const backup = await createBackup(repositories)
      const result = await platform.saveAutoBackup({ content: serializeBackup(backup) })

      if (result.saved) dirty = false
    } catch {
      // Une nouvelle tentative aura lieu à la prochaine modification ou au
      // prochain passage de l'intervalle.
    } finally {
      running = false

      if (dirty && !stopped) {
        schedule(RETRY_DELAY_MS, () => void runBackup())
      }
    }
  }

  const handleMutation = (): void => {
    dirty = true
    schedule(CHANGE_DEBOUNCE_MS, () => void runBackup())
  }

  Dexie.on('storagemutated', handleMutation)

  const initialTimer = window.setTimeout(() => void runBackup(), INITIAL_DELAY_MS)
  const intervalTimer = window.setInterval(() => {
    if (dirty) void runBackup()
  }, INTERVAL_MS)

  return () => {
    stopped = true
    clearDebounce()
    window.clearTimeout(initialTimer)
    window.clearInterval(intervalTimer)
    Dexie.on('storagemutated').unsubscribe(handleMutation)
  }
}
