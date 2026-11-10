import type { Table } from 'dexie'
import type { Block, LocalDate } from '../../core/types'
import { BaseRepository, type ReadOptions } from './base'

export interface CreateBlockInput {
  itemId: string
  date: LocalDate
  startMin?: number | null
  durationMin: number
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
      durationMin: input.durationMin
    })
  }

  /** Blocs d'une journée, via l'index sur `date`. */
  async listByDate(date: LocalDate, options: ReadOptions = {}): Promise<Block[]> {
    const blocks = await this.table.where('date').equals(date).toArray()
    return this.filterReadable(blocks, options)
  }

  /** Blocs d'une plage de dates inclusive, via l'index sur `date`. */
  async listBetween(
    startDate: LocalDate,
    endDate: LocalDate,
    options: ReadOptions = {}
  ): Promise<Block[]> {
    const blocks = await this.table.where('date').between(startDate, endDate, true, true).toArray()
    return this.filterReadable(blocks, options)
  }

  /** Tous les blocs d'une tâche, répartis sur un ou plusieurs jours. */
  async listByItem(itemId: string, options: ReadOptions = {}): Promise<Block[]> {
    const blocks = await this.table.where('itemId').equals(itemId).toArray()
    return this.filterReadable(blocks, options)
  }
}
