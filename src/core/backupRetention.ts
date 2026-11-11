/** Préfixe des copies automatiques écrites par Electron. */
export const AUTO_BACKUP_PREFIX = 'planner-auto-'

/** Nombre de copies automatiques conservées. */
export const AUTO_BACKUP_KEEP = 5

/**
 * Nom d'une copie automatique. L'horodatage ISO est rendu compatible avec les
 * systèmes de fichiers Windows ; son ordre lexicographique reste chronologique.
 */
export function autoBackupFileName(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Date de sauvegarde invalide.')
  }

  return `${AUTO_BACKUP_PREFIX}${date.toISOString().replace(/[:.]/g, '-')}.json`
}

/** Reconnaît uniquement les fichiers produits par la sauvegarde automatique. */
export function isAutoBackupFileName(fileName: string): boolean {
  return fileName.startsWith(AUTO_BACKUP_PREFIX) && fileName.endsWith('.json')
}

/**
 * Anciens fichiers à supprimer après l'écriture d'une nouvelle copie. Les noms
 * sont triés du plus récent au plus ancien ; les plus récents sont conservés.
 */
export function selectAutoBackupsToDelete(
  fileNames: readonly string[],
  keep: number = AUTO_BACKUP_KEEP
): string[] {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError('Le nombre de sauvegardes à conserver doit être un entier positif.')
  }

  return fileNames
    .filter(isAutoBackupFileName)
    .sort((a, b) => b.localeCompare(a))
    .slice(keep)
}
