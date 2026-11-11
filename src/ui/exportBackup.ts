import { backupFileName, createBackup, serializeBackup } from '../db/backup'
import { repositories } from '../db/repositories'
import { platform } from '../platform'

/** Prépare la sauvegarde complète puis la remet à la plateforme d'export. */
export async function exportBackup(): Promise<void> {
  const backup = await createBackup(repositories)

  await platform.saveTextFile({
    fileName: backupFileName(),
    content: serializeBackup(backup),
    mimeType: 'application/json',
    filters: [{ name: 'Sauvegarde Planner', extensions: ['json'] }]
  })
}
