import type { Table } from 'dexie'
import type { LocalDate, Template, TemplateKind } from '../../core/types'
import { BaseRepository } from './base'

export interface CreateTemplateInput {
  kind: TemplateKind
  title: string
  categoryId?: string | null
  rrule: string
  startMin: number
  durationMin: number
  validFrom: LocalDate
  validUntil?: LocalDate | null
}

export class TemplateRepository extends BaseRepository<Template> {
  constructor(table: Table<Template, string>) {
    super(table, 'Modèle')
  }

  async create(input: CreateTemplateInput): Promise<Template> {
    return this.insert({
      kind: input.kind,
      title: input.title,
      categoryId: input.categoryId ?? null,
      rrule: input.rrule,
      startMin: input.startMin,
      durationMin: input.durationMin,
      validFrom: input.validFrom,
      validUntil: input.validUntil ?? null
    })
  }
}
