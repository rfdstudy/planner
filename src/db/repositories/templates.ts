import type { Table } from 'dexie'
import { parseWeeklyDays } from '../../core/recurrence'
import { MINUTES_PER_DAY, isLocalDate } from '../../core/time'
import type { LocalDate, Template, TemplateKind } from '../../core/types'
import { BaseRepository, type EntityData } from './base'

export interface TemplateDetailsInput {
  kind: TemplateKind
  title: string
  categoryId?: string | null
  rrule: string
  startMin: number
  durationMin: number
  validFrom: LocalDate
  validUntil?: LocalDate | null
}

export type CreateTemplateInput = TemplateDetailsInput
export type UpdateTemplateInput = TemplateDetailsInput

function validateTemplateDetails(input: TemplateDetailsInput): EntityData<Template> {
  const title = input.title.trim()

  if (title.length === 0) {
    throw new RangeError('Donnez un titre au modèle.')
  }

  if (input.kind !== 'fixed' && input.kind !== 'free') {
    throw new RangeError('Le type du modèle doit être « fixe » ou « libre ».')
  }

  if (!isLocalDate(input.validFrom)) {
    throw new RangeError('La date de début de validité est invalide.')
  }

  if (input.validUntil !== null && input.validUntil !== undefined) {
    if (!isLocalDate(input.validUntil)) {
      throw new RangeError('La date de fin de validité est invalide.')
    }

    if (input.validUntil < input.validFrom) {
      throw new RangeError('La fin de validité précède le début.')
    }
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

  if (parseWeeklyDays(input.rrule).length === 0) {
    throw new RangeError('Choisissez au moins un jour de la semaine.')
  }

  return {
    kind: input.kind,
    title,
    categoryId: input.categoryId ?? null,
    rrule: input.rrule.trim(),
    startMin: input.startMin,
    durationMin: input.durationMin,
    validFrom: input.validFrom,
    validUntil: input.validUntil ?? null
  }
}

export class TemplateRepository extends BaseRepository<Template> {
  constructor(table: Table<Template, string>) {
    super(table, 'Modèle')
  }

  async create(input: CreateTemplateInput): Promise<Template> {
    return this.insert(validateTemplateDetails(input))
  }

  /** Modifie tous les champs d'un modèle depuis l'écran « Semaine type ». */
  async updateDetails(id: string, input: UpdateTemplateInput): Promise<Template> {
    return this.update(id, validateTemplateDetails(input))
  }
}
