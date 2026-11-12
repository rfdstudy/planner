import { getRecurrenceKind, parseWeeklyDays } from '../../core/recurrence'
import { MINUTES_PER_DAY, isLocalDate } from '../../core/time'
import type { ItemType, LocalDate, Template } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { BaseRepository, RecordDeletedError, RecordNotFoundError, type EntityData } from './base'

export interface TemplateDetailsInput {
  typeId: string
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

  if (input.typeId.trim().length === 0) {
    throw new RangeError('Choisissez un type pour le modèle.')
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

  const recurrence = getRecurrenceKind(input.rrule)

  if (recurrence === null) {
    throw new RangeError('La règle doit être hebdomadaire ou annuelle.')
  }

  if (recurrence === 'weekly' && parseWeeklyDays(input.rrule).length === 0) {
    throw new RangeError('Choisissez au moins un jour de la semaine.')
  }

  return {
    typeId: input.typeId,
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
  constructor(private readonly database: PlannerDatabase) {
    super(database.templates, 'Modèle')
  }

  async create(input: CreateTemplateInput): Promise<Template> {
    await this.requireType(input.typeId)
    return this.insert(validateTemplateDetails(input))
  }

  /** Modifie tous les champs d'un modèle depuis l'écran « Semaine type ». */
  async updateDetails(id: string, input: UpdateTemplateInput): Promise<Template> {
    await this.requireType(input.typeId)
    return this.update(id, validateTemplateDetails(input))
  }

  private async requireType(typeId: string): Promise<ItemType> {
    const type = await this.database.itemTypes.get(typeId)

    if (type === undefined) {
      throw new RecordNotFoundError('Type d’élément', typeId)
    }

    if (type.deletedAt !== null) {
      throw new RecordDeletedError('Type d’élément', typeId)
    }

    return type
  }
}
