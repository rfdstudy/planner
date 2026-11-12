import { Frequency, RRule } from 'rrule'
import { getWeekdayIndex, isLocalDate, parseLocalDate } from './time'
import type { LocalDate, Override, Template } from './types'

/** Codes RRULE des jours, dans l'ordre d'une semaine française. */
export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

export type WeekdayCode = (typeof WEEKDAY_CODES)[number]

/** Période inclusive, exprimée en dates locales. */
export interface RecurrenceRange {
  start: LocalDate
  end: LocalDate
}

/**
 * Occurrence calculée à l'affichage. Elle n'existe jamais telle quelle en base :
 * sa clé est stable tant que le modèle et la date ne changent pas.
 */
export interface TemplateOccurrence {
  /** Identifiant synthétique, par exemple `template:<id>:2026-11-09`. */
  id: string
  templateId: string
  date: LocalDate
  typeId: string
  title: string
  categoryId: string | null
  startMin: number
  durationMin: number
  /** Exception de modification appliquée, ou `null` si l'occurrence est nue. */
  overrideId: string | null
}

export type RecurrenceKind = 'weekly' | 'yearly'

/** Reconnaît une règle hebdomadaire ou annuelle, sans lever d'exception. */
export function getRecurrenceKind(rrule: string): RecurrenceKind | null {
  const normalized = rrule.trim().replace(/^RRULE:/i, '')

  try {
    const options = RRule.parseString(normalized)

    if (options.freq === Frequency.WEEKLY) return 'weekly'
    if (options.freq === Frequency.YEARLY) return 'yearly'

    return null
  } catch {
    return null
  }
}

/** Clé stable d'une occurrence, utilisée pour les blocs virtuels de la grille. */
export function occurrenceId(templateId: string, date: LocalDate): string {
  return `template:${templateId}:${date}`
}

/** Code RRULE du jour d'une date locale. */
export function weekdayCodeFromDate(date: LocalDate): WeekdayCode {
  const code = WEEKDAY_CODES[getWeekdayIndex(date)]

  if (code === undefined) {
    throw new RangeError(`Date locale invalide : ${date}`)
  }

  return code
}

/**
 * Construit une règle hebdomadaire standard à partir de jours choisis dans
 * l'interface. Les doublons sont ignorés et les jours sont remis dans l'ordre
 * de la semaine, par exemple `FREQ=WEEKLY;BYDAY=MO,WE`.
 */
export function buildWeeklyRrule(days: readonly WeekdayCode[]): string {
  const uniqueDays = new Set(days)

  for (const day of uniqueDays) {
    if (!WEEKDAY_CODES.includes(day)) {
      throw new RangeError(`Jour de récurrence invalide : ${String(day)}`)
    }
  }

  const orderedDays = WEEKDAY_CODES.filter((day) => uniqueDays.has(day))

  if (orderedDays.length === 0) {
    throw new RangeError('Choisissez au moins un jour de la semaine.')
  }

  return `FREQ=WEEKLY;BYDAY=${orderedDays.join(',')}`
}

/**
 * Règle annuelle standard. Le jour et le mois sont portés par la date de
 * début de validité (`validFrom`), ce qui gère naturellement le 29 février :
 * l'occurrence n'existe que les années bissextiles.
 */
export function buildYearlyRrule(): string {
  return 'FREQ=YEARLY'
}

/**
 * Lit les jours d'une règle hebdomadaire. Renvoie un tableau vide lorsque la
 * règle est illisible, n'est pas hebdomadaire ou ne précise aucun jour : les
 * écrans peuvent ainsi rester utilisables sans masquer l'erreur de saisie.
 */
export function parseWeeklyDays(rrule: string): WeekdayCode[] {
  const normalized = rrule.trim().replace(/^RRULE:/i, '')

  try {
    const options = RRule.parseString(normalized)

    if (options.freq !== Frequency.WEEKLY) return []

    const days = new Set<WeekdayCode>()

    for (const attribute of normalized.split(';')) {
      const [rawKey, rawValue] = attribute.split('=')

      if (rawKey?.toUpperCase() !== 'BYDAY' || rawValue === undefined) continue

      for (const rawDay of rawValue.split(',')) {
        const code = rawDay
          .trim()
          .toUpperCase()
          .replace(/^[+-]?\d*/, '')

        if (WEEKDAY_CODES.includes(code as WeekdayCode)) {
          days.add(code as WeekdayCode)
        }
      }
    }

    return WEEKDAY_CODES.filter((day) => days.has(day))
  } catch {
    return []
  }
}

/**
 * Remplace le jour d'une occurrence dans une règle hebdomadaire. Sert à
 * « déplacer toutes les semaines » : le lundi devient par exemple le mardi.
 * Si le jour d'arrivée existe déjà, le doublon est fusionné.
 */
export function replaceWeekdayInRrule(
  rrule: string,
  source: WeekdayCode,
  target: WeekdayCode
): string {
  const days = parseWeeklyDays(rrule)

  if (!days.includes(source) || days.length === 0) return rrule

  return buildWeeklyRrule(days.map((day) => (day === source ? target : day)))
}

/** Retire un jour d'une règle hebdomadaire ; `null` s'il ne reste aucun jour. */
export function removeWeekdayFromRrule(rrule: string, day: WeekdayCode): string | null {
  const days = parseWeeklyDays(rrule)
  const remaining = days.filter((candidate) => candidate !== day)

  if (remaining.length === 0) return null

  return buildWeeklyRrule(remaining)
}

function toUtcDate(date: LocalDate): Date {
  const parsed = parseLocalDate(date)
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
}

function fromUtcDate(date: Date): LocalDate {
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function compareDates(a: LocalDate, b: LocalDate): number {
  return a.localeCompare(b)
}

function parseRule(template: Template): RRule | null {
  const normalized = template.rrule.trim().replace(/^RRULE:/i, '')

  try {
    const options = RRule.parseString(normalized)

    if (options.freq !== Frequency.WEEKLY && options.freq !== Frequency.YEARLY) {
      return null
    }

    return new RRule({
      ...options,
      dtstart: toUtcDate(template.validFrom)
    })
  } catch {
    return null
  }
}

function activeOverridesByKey(overrides: readonly Override[]): Map<string, Override> {
  const map = new Map<string, Override>()

  for (const override of overrides) {
    if (override.deletedAt !== null) continue

    const key = `${override.templateId}:${override.date}`
    const existing = map.get(key)

    // En cas de doublon historique, la dernière modification fait foi.
    if (existing === undefined || override.updatedAt >= existing.updatedAt) {
      map.set(key, override)
    }
  }

  return map
}

function occurrenceFor(
  template: Template,
  date: LocalDate,
  override: Override | undefined
): TemplateOccurrence | null {
  const base: TemplateOccurrence = {
    id: occurrenceId(template.id, date),
    templateId: template.id,
    date,
    typeId: template.typeId,
    title: template.title,
    categoryId: template.categoryId,
    startMin: template.startMin,
    durationMin: template.durationMin,
    overrideId: null
  }

  if (override === undefined) return base
  if (override.action === 'skip') return null

  return {
    ...base,
    typeId: override.typeId ?? template.typeId,
    title: override.title ?? template.title,
    // Une exception de modification enregistre la catégorie résultante, y
    // compris « sans catégorie » : `null` est donc significatif ici.
    categoryId: override.categoryId,
    startMin: override.startMin ?? template.startMin,
    durationMin: override.durationMin ?? template.durationMin,
    overrideId: override.id
  }
}

/** Occurrences d'un modèle sur une période, exceptions appliquées. */
export function occurrencesForTemplate(
  template: Template,
  overrides: readonly Override[],
  range: RecurrenceRange
): TemplateOccurrence[] {
  if (template.deletedAt !== null) return []
  if (!isLocalDate(range.start) || !isLocalDate(range.end)) {
    throw new RangeError('Période de récurrence invalide.')
  }
  if (compareDates(range.start, range.end) > 0) {
    throw new RangeError('La fin de la période précède son début.')
  }

  const effectiveStart =
    compareDates(range.start, template.validFrom) < 0 ? template.validFrom : range.start
  const effectiveEnd =
    template.validUntil === null || compareDates(range.end, template.validUntil) < 0
      ? range.end
      : template.validUntil

  if (compareDates(effectiveStart, effectiveEnd) > 0) return []

  const rule = parseRule(template)

  if (rule === null) return []

  let dates: Date[]

  try {
    dates = rule.between(toUtcDate(effectiveStart), toUtcDate(effectiveEnd), true)
  } catch {
    return []
  }

  const overridesByKey = activeOverridesByKey(overrides)
  const occurrences: TemplateOccurrence[] = []
  const seenDates = new Set<LocalDate>()

  for (const date of dates) {
    const localDate = fromUtcDate(date)

    if (seenDates.has(localDate)) continue
    seenDates.add(localDate)

    const occurrence = occurrenceFor(
      template,
      localDate,
      overridesByKey.get(`${template.id}:${localDate}`)
    )

    if (occurrence !== null) occurrences.push(occurrence)
  }

  return occurrences
}

/**
 * Calcule toutes les occurrences d'un ensemble de modèles, bornées à une
 * période. Les modèles supprimés, les exceptions supprimées et les règles
 * illisibles sont ignorés pour ne jamais faire échouer l'affichage.
 */
export function computeOccurrences(
  templates: readonly Template[],
  overrides: readonly Override[],
  range: RecurrenceRange
): TemplateOccurrence[] {
  if (!isLocalDate(range.start) || !isLocalDate(range.end)) {
    throw new RangeError('Période de récurrence invalide.')
  }
  if (compareDates(range.start, range.end) > 0) {
    throw new RangeError('La fin de la période précède son début.')
  }

  return templates
    .filter((template) => template.deletedAt === null)
    .flatMap((template) => occurrencesForTemplate(template, overrides, range))
    .sort(
      (a, b) =>
        compareDates(a.date, b.date) ||
        a.startMin - b.startMin ||
        a.title.localeCompare(b.title, 'fr') ||
        a.id.localeCompare(b.id)
    )
}
