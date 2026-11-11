import {
  removeWeekdayFromRrule,
  replaceWeekdayInRrule,
  weekdayCodeFromDate
} from '../../core/recurrence'
import { MINUTES_PER_DAY, isLocalDate } from '../../core/time'
import type { LocalDate, Template, TemplateKind } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { RecordNotFoundError } from './base'
import { BlockRepository } from './blocks'
import { ItemRepository } from './items'
import { OverrideRepository } from './overrides'
import { TemplateRepository, type TemplateDetailsInput } from './templates'

/** Valeurs complètes d'une occurrence, telles qu'affichées après édition. */
export interface OccurrenceValues {
  kind: TemplateKind
  title: string
  categoryId: string | null
  startMin: number
  durationMin: number
}

export interface EditOccurrenceInput extends OccurrenceValues {
  templateId: string
  date: LocalDate
}

export interface MoveOccurrenceInput extends OccurrenceValues {
  templateId: string
  /** Date de l'occurrence d'origine, celle qui porte l'exception. */
  date: LocalDate
  targetDate: LocalDate
}

export interface EditOccurrenceEveryWeekInput extends EditOccurrenceInput {
  /** Date d'arrivée ; identique à `date` lorsque seul le contenu change. */
  targetDate: LocalDate
}

function assertDate(date: LocalDate): void {
  if (!isLocalDate(date)) {
    throw new RangeError(`Date locale invalide : ${date}`)
  }
}

function assertOccurrenceValues(input: OccurrenceValues): void {
  if (input.title.trim().length === 0) {
    throw new RangeError('Donnez un titre à l’occurrence.')
  }

  if (input.kind !== 'fixed' && input.kind !== 'free') {
    throw new RangeError('Un modèle de semaine type est soit fixe, soit libre.')
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

/**
 * Opérations propres aux blocs de la semaine type.
 *
 * Les occurrences ne sont jamais stockées jour par jour : « cette fois
 * seulement » écrit une exception, « toutes les semaines » modifie le modèle.
 * Lorsqu'une occurrence change de jour pour une seule semaine, elle est
 * supprimée par une exception et recréée comme bloc autonome à la nouvelle
 * date, car le modèle d'exception ne porte pas de date d'arrivée.
 */
export class RecurrenceRepository {
  private readonly templates: TemplateRepository
  private readonly overrides: OverrideRepository
  private readonly items: ItemRepository
  private readonly blocks: BlockRepository

  constructor(private readonly database: PlannerDatabase) {
    this.templates = new TemplateRepository(database.templates)
    this.overrides = new OverrideRepository(database.overrides)
    this.items = new ItemRepository(database.items)
    this.blocks = new BlockRepository(database.blocks)
  }

  /** Modifie une occurrence pour cette semaine uniquement. */
  async editOccurrenceOnce(input: EditOccurrenceInput): Promise<void> {
    assertDate(input.date)
    assertOccurrenceValues(input)
    await this.requireTemplate(input.templateId)

    await this.overrides.upsertModify({
      templateId: input.templateId,
      date: input.date,
      title: input.title,
      categoryId: input.categoryId,
      startMin: input.startMin,
      durationMin: input.durationMin
    })
  }

  /**
   * Déplace une occurrence pour cette semaine. Un déplacement dans la même
   * journée devient une exception de modification ; un changement de jour
   * devient une exception de suppression plus un bloc autonome à la nouvelle
   * date.
   */
  async moveOccurrenceOnce(input: MoveOccurrenceInput): Promise<void> {
    assertDate(input.date)
    assertDate(input.targetDate)
    assertOccurrenceValues(input)
    const template = await this.requireTemplate(input.templateId)

    if (input.targetDate === input.date) {
      await this.editOccurrenceOnce(input)
      return
    }

    await this.database.transaction(
      'rw',
      [this.database.overrides, this.database.items, this.database.blocks],
      async () => {
        await this.overrides.upsertSkip(template.id, input.date)

        const item = await this.items.create({
          kind: template.kind,
          title: input.title,
          categoryId: input.categoryId,
          templateId: template.id
        })

        await this.blocks.create({
          itemId: item.id,
          date: input.targetDate,
          startMin: input.startMin,
          durationMin: input.durationMin
        })
      }
    )
  }

  /** Supprime une occurrence pour cette semaine uniquement. */
  async deleteOccurrenceOnce(templateId: string, date: LocalDate): Promise<void> {
    assertDate(date)
    await this.requireTemplate(templateId)
    await this.overrides.upsertSkip(templateId, date)
  }

  /**
   * Applique une modification au modèle entier. Si le jour change, le jour
   * d'origine est remplacé dans la règle hebdomadaire.
   */
  async updateOccurrenceEveryWeek(input: EditOccurrenceEveryWeekInput): Promise<Template> {
    assertDate(input.date)
    assertDate(input.targetDate)
    assertOccurrenceValues(input)
    const template = await this.requireTemplate(input.templateId)

    return this.updateTemplateFromOccurrence(template, {
      values: input,
      sourceDay: weekdayCodeFromDate(input.date),
      targetDay: weekdayCodeFromDate(input.targetDate),
      targetDate: input.targetDate
    })
  }

  /**
   * Déplace une occurrence sur toutes les semaines. Le jour d'origine de la
   * règle est remplacé par le jour d'arrivée.
   */
  async moveOccurrenceEveryWeek(input: MoveOccurrenceInput): Promise<Template> {
    return this.updateOccurrenceEveryWeek(input)
  }

  /** Redimensionne une occurrence sur toutes les semaines. */
  async resizeOccurrenceEveryWeek(
    templateId: string,
    date: LocalDate,
    values: OccurrenceValues
  ): Promise<Template> {
    return this.updateOccurrenceEveryWeek({
      ...values,
      templateId,
      date,
      targetDate: date
    })
  }

  /**
   * Supprime un bloc sur toutes les semaines. Le jour est retiré de la règle ;
   * si c'était le dernier jour du modèle, le modèle entier est supprimé.
   */
  async deleteOccurrenceEveryWeek(templateId: string, date: LocalDate): Promise<void> {
    assertDate(date)
    const template = await this.requireTemplate(templateId)
    const day = weekdayCodeFromDate(date)
    const rrule = removeWeekdayFromRrule(template.rrule, day)

    if (rrule === null) {
      await this.templates.softDelete(template.id)
      return
    }

    await this.templates.updateDetails(template.id, {
      kind: template.kind,
      title: template.title,
      categoryId: template.categoryId,
      rrule,
      startMin: template.startMin,
      durationMin: template.durationMin,
      validFrom: template.validFrom,
      validUntil: template.validUntil
    })
  }

  /** Supprime le modèle et toutes ses occurrences futures. */
  async deleteTemplate(templateId: string): Promise<void> {
    await this.requireTemplate(templateId)
    await this.templates.softDelete(templateId)
  }

  async createTemplate(input: TemplateDetailsInput): Promise<Template> {
    return this.templates.create(input)
  }

  async updateTemplate(templateId: string, input: TemplateDetailsInput): Promise<Template> {
    await this.requireTemplate(templateId)
    return this.templates.updateDetails(templateId, input)
  }

  private async requireTemplate(templateId: string): Promise<Template> {
    const template = await this.templates.get(templateId)

    if (template === undefined) {
      throw new RecordNotFoundError('Modèle', templateId)
    }

    return template
  }

  private async updateTemplateFromOccurrence(
    template: Template,
    input: {
      values: OccurrenceValues
      sourceDay: ReturnType<typeof weekdayCodeFromDate>
      targetDay: ReturnType<typeof weekdayCodeFromDate>
      targetDate: LocalDate
    }
  ): Promise<Template> {
    const { values, sourceDay, targetDay, targetDate } = input
    const rrule =
      sourceDay === targetDay
        ? template.rrule
        : replaceWeekdayInRrule(template.rrule, sourceDay, targetDay)

    const validFrom = targetDate < template.validFrom ? targetDate : template.validFrom
    const validUntil =
      template.validUntil !== null && targetDate > template.validUntil
        ? targetDate
        : template.validUntil

    return this.templates.updateDetails(template.id, {
      kind: values.kind,
      title: values.title,
      categoryId: values.categoryId,
      rrule,
      startMin: values.startMin,
      durationMin: values.durationMin,
      validFrom,
      validUntil
    })
  }
}
