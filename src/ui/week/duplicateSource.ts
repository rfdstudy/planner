import { createDuplicateSnapshot, type DuplicateSource } from '../../core/duplicate'
import type { ScheduleEntry } from './scheduleTypes'

/**
 * Source de duplication d'une entrée affichée. Une occurrence de semaine type
 * n'existe pas en base : elle est copiée depuis un instantané et devient un
 * élément normal, sans lien avec le modèle.
 */
export function duplicateSourceFromEntry(entry: ScheduleEntry): DuplicateSource {
  if (entry.template === null) {
    return { kind: 'stored', itemId: entry.item.id, blockId: entry.block.id }
  }

  return {
    kind: 'snapshot',
    snapshot: createDuplicateSnapshot(entry.item, entry.block)
  }
}
