import {
  PHONE_SNAPSHOT_FILE_NAME,
  createPhoneSnapshot,
  serializePhoneSnapshot
} from '../core/phoneSnapshot'
import { todayLocalDate } from '../core/time'
import { repositories } from '../db/repositories'
import { platform } from '../platform'

/**
 * Prépare l'instantané de la fenêtre courante puis le remet à la plateforme.
 * Les données sont lues via les repositories, jamais directement dans Dexie.
 */
export async function exportPhoneSnapshot(now: Date = new Date()): Promise<boolean> {
  const [categories, itemTypes, items, blocks, templates, overrides] = await Promise.all([
    repositories.categories.list(),
    repositories.itemTypes.list(),
    repositories.items.list(),
    repositories.blocks.list(),
    repositories.templates.list(),
    repositories.overrides.list()
  ])

  const snapshot = createPhoneSnapshot({
    today: todayLocalDate(now),
    generatedAt: now.toISOString(),
    categories,
    itemTypes,
    items,
    blocks,
    templates,
    overrides
  })

  const result = await platform.savePhoneSnapshot({
    fileName: PHONE_SNAPSHOT_FILE_NAME,
    content: serializePhoneSnapshot(snapshot),
    mimeType: 'application/json',
    filters: [{ name: 'Instantané Planner', extensions: ['json'] }]
  })

  return result.saved
}
