import type { Table } from 'dexie'
import type { LocalDate, Override, OverrideAction } from '../../core/types'
import { BaseRepository } from './base'

export interface CreateOverrideInput {
  templateId: string
  date: LocalDate
  action: OverrideAction
  title?: string | null
  categoryId?: string | null
  startMin?: number | null
  durationMin?: number | null
}

export class OverrideRepository extends BaseRepository<Override> {
  constructor(table: Table<Override, string>) {
    super(table, 'Exception de modèle')
  }

  async create(input: CreateOverrideInput): Promise<Override> {
    return this.insert({
      templateId: input.templateId,
      date: input.date,
      action: input.action,
      title: input.title ?? null,
      categoryId: input.categoryId ?? null,
      startMin: input.startMin ?? null,
      durationMin: input.durationMin ?? null
    })
  }
}
