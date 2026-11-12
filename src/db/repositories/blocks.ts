import type { Table } from 'dexie'
import { getBlockEndDate } from '../../core/schedule'
import type { Block, LocalDate } from '../../core/types'
import { BaseRepository, type ReadOptions } from './base'

export interface CreateBlockInput {
  itemId: string
  date: LocalDate
  startMin?: number | null
  durationMin: number
  /** Dernier jour inclus d'un élément de la ligne du haut. */
  endDate?: LocalDate | null
}

/** Les bases antérieures à cette évolution ne possèdent pas `endDate`. */
function withEndDate(block: Block): Block {
  return block.endDate === undefined ? { ...block, endDate: null } : block
}

export class BlockRepository extends BaseRepository<Block> {
  constructor(table: Table<Block, string>) {
    super(table, 'Bloc')
  }

  async create(input: CreateBlockInput): Promise<Block> {
    return this.insert({
      itemId: input.itemId,
      date: input.date,
      startMin: input.startMin ?? null,
      durationMin: input.durationMin,
      endDate: input.endDate ?? null
    })
  }

  /** Blocs d'une journée, via l'index sur `date`. */
  async listByDate(date: LocalDate, options: ReadOptions = {}): Promise<Block[]> {
    const blocks = await this.table.where('date').equals(date).toArray()
    return this.filterReadable(blocks.map(withEndDate), options)
  }

  /** Blocs dont la date de début appartient à une plage inclusive. */
  async listBetween(
    startDate: LocalDate,
    endDate: LocalDate,
    options: ReadOptions = {}
  ): Promise<Block[]> {
    const blocks = await this.table.where('date').between(startDate, endDate, true, true).toArray()
    return this.filterReadable(blocks.map(withEndDate), options)
  }

  /**
   * Blocs qui chevauchent une plage inclusive, y compris ceux commencés avant
   * la plage et terminés dedans. L'index ne porte que sur `date` : on remonte
   * jusqu'à la fin de la plage puis on filtre sur la date de fin.
   */
  async listOverlapping(
    startDate: LocalDate,
    endDate: LocalDate,
    options: ReadOptions = {}
  ): Promise<Block[]> {
    const blocks = await this.table.where('date').belowOrEqual(endDate).toArray()
    const readable = this.filterReadable(blocks.map(withEndDate), options)

    return readable
      .filter((block) => block.date <= endDate && getBlockEndDate(block) >= startDate)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || getBlockEndDate(a).localeCompare(getBlockEndDate(b))
      )
  }

  /** Tous les blocs d'une tâche, répartis sur un ou plusieurs jours. */
  async listByItem(itemId: string, options: ReadOptions = {}): Promise<Block[]> {
    const blocks = await this.table.where('itemId').equals(itemId).toArray()
    return this.filterReadable(blocks.map(withEndDate), options)
  }
}
