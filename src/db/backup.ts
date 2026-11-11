import { formatLocalDate } from '../core/time'
import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  Override,
  Setting,
  Template
} from '../core/types'
import { DATABASE_VERSION } from './database'
import type { Repositories } from './repositories'

/** Marqueur permettant de reconnaître une sauvegarde Planner. */
export const BACKUP_FORMAT = 'planner-backup'

export interface BackupData {
  categoryGroups: CategoryGroup[]
  categories: Category[]
  items: Item[]
  blocks: Block[]
  templates: Template[]
  overrides: Override[]
  settings: Setting[]
}

/** Sauvegarde JSON complète, y compris les enregistrements supprimés. */
export interface PlannerBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: BackupData
}

/**
 * Lit toutes les tables en incluant les suppressions logiques : une sauvegarde
 * doit pouvoir restaurer l'état exact, pas seulement les lignes visibles.
 */
export async function createBackup(
  repositories: Repositories,
  exportedAt: Date = new Date()
): Promise<PlannerBackup> {
  const [categoryGroups, categories, items, blocks, templates, overrides, settings] =
    await Promise.all([
      repositories.categoryGroups.list({ includeDeleted: true }),
      repositories.categories.list({ includeDeleted: true }),
      repositories.items.list({ includeDeleted: true }),
      repositories.blocks.list({ includeDeleted: true }),
      repositories.templates.list({ includeDeleted: true }),
      repositories.overrides.list({ includeDeleted: true }),
      repositories.settings.list({ includeDeleted: true })
    ])

  return {
    format: BACKUP_FORMAT,
    version: DATABASE_VERSION,
    exportedAt: exportedAt.toISOString(),
    data: { categoryGroups, categories, items, blocks, templates, overrides, settings }
  }
}

/** Sérialise la sauvegarde avec une indentation lisible. */
export function serializeBackup(backup: PlannerBackup): string {
  return JSON.stringify(backup, null, 2)
}

/** Nom de fichier daté proposé par la boîte d'enregistrement. */
export function backupFileName(date: Date = new Date()): string {
  return `planner-sauvegarde-${formatLocalDate(date)}.json`
}
