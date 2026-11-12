import type { Table } from 'dexie'
import { MINUTES_PER_DAY, isLocalDate } from '../../core/time'
import type { LocalDate, Override, OverrideAction } from '../../core/types'
import { BaseRepository, type ReadOptions } from './base'

export interface CreateOverrideInput {
  templateId: string
  date: LocalDate
  action: OverrideAction
  typeId?: string | null
  title?: string | null
  categoryId?: string | null
  startMin?: number | null
  durationMin?: number | null
}

export interface ModifyOverrideInput {
  templateId: string
  date: LocalDate
  typeId: string
  title: string
  categoryId: string | null
  startMin: number
  durationMin: number
}

function assertDate(date: LocalDate): void {
  if (!isLocalDate(date)) {
    throw new RangeError(`Date locale invalide : ${date}`)
  }
}

function assertModifyValues(input: ModifyOverrideInput): void {
  if (input.title.trim().length === 0) {
    throw new RangeError('Donnez un titre à l’occurrence.')
  }

  if (
    !Number.isInteger(input.startMin) ||
    input.startMin < 0 ||
    input.startMin >= MINUTES_PER_DAY
  ) {
    throw new RangeError('L’heure de début doit être comprise dans la journée.')
  }

  if (
    !Number.isInteger(input.durationMin) ||
    input.durationMin < 1 ||
    input.durationMin > MINUTES_PER_DAY
  ) {
    throw new RangeError('La durée doit être un nombre entier de minutes, entre 1 et 1440.')
  }

  if (input.startMin + input.durationMin > MINUTES_PER_DAY) {
    throw new RangeError('Le bloc dépasserait minuit.')
  }
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
      typeId: input.typeId ?? null,
      title: input.title ?? null,
      categoryId: input.categoryId ?? null,
      startMin: input.startMin ?? null,
      durationMin: input.durationMin ?? null
    })
  }

  async listByTemplate(templateId: string, options: ReadOptions = {}): Promise<Override[]> {
    const overrides = await this.table.where('templateId').equals(templateId).toArray()
    return this.filterReadable(overrides, options)
  }

  /** Exception active d'une occurrence donnée, s'il en existe une. */
  async findActive(templateId: string, date: LocalDate): Promise<Override | undefined> {
    const overrides = await this.table
      .where('[templateId+date]')
      .equals([templateId, date])
      .toArray()
    const active = this.filterReadable(overrides)

    return active.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).at(-1)
  }

  /** Supprime une occurrence sans toucher aux autres semaines. */
  async upsertSkip(templateId: string, date: LocalDate): Promise<Override> {
    assertDate(date)

    const existing = await this.findActive(templateId, date)
    const values = {
      action: 'skip' as const,
      typeId: null,
      title: null,
      categoryId: null,
      startMin: null,
      durationMin: null
    }

    if (existing !== undefined) {
      return this.update(existing.id, values)
    }

    return this.insert({ templateId, date, ...values })
  }

  /**
   * Enregistre l'état complet d'une occurrence modifiée. La catégorie est
   * toujours écrite, y compris `null`, pour permettre « sans catégorie ».
   */
  async upsertModify(input: ModifyOverrideInput): Promise<Override> {
    assertDate(input.date)
    assertModifyValues(input)

    const existing = await this.findActive(input.templateId, input.date)
    const values = {
      action: 'modify' as const,
      typeId: input.typeId,
      title: input.title.trim(),
      categoryId: input.categoryId,
      startMin: input.startMin,
      durationMin: input.durationMin
    }

    if (existing !== undefined) {
      return this.update(existing.id, values)
    }

    return this.insert({ templateId: input.templateId, date: input.date, ...values })
  }
}
