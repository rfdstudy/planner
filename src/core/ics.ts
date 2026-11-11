import { computeOccurrences } from './recurrence'
import { addDays, MINUTES_PER_DAY } from './time'
import type { Block, Category, Item, LocalDate, Override, Template } from './types'

export interface CalendarExportInput {
  items: readonly Item[]
  blocks: readonly Block[]
  templates: readonly Template[]
  overrides: readonly Override[]
  categories: readonly Category[]
  /** Instant de génération, utilisé pour `DTSTAMP`. */
  now?: Date
}

const CALENDAR_NAME = 'Planner'
const PRODUCT_ID = '-//Planner//Planner v2//FR'
const TEMPLATE_UID_SUFFIX = '@planner.local'

/** Nombre de jours explorés pour trouver la première occurrence d'un modèle. */
const FIRST_OCCURRENCE_SEARCH_DAYS = 366

const encoder = new TextEncoder()

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatIcsDate(date: LocalDate): string {
  return date.replace(/-/g, '')
}

function formatIcsDateTime(date: LocalDate, minutes: number): string {
  const safeMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)))
  const hours = Math.floor(safeMinutes / 60)
  const remaining = safeMinutes % 60

  return `${formatIcsDate(date)}T${pad2(hours)}${pad2(remaining)}00`
}

function formatIcsEventEnd(date: LocalDate, minutes: number): string {
  if (minutes >= MINUTES_PER_DAY) {
    return formatIcsDateTime(addDays(date, 1), minutes - MINUTES_PER_DAY)
  }

  return formatIcsDateTime(date, minutes)
}

function formatIcsUtc(date: Date): string {
  return (
    `${String(date.getUTCFullYear()).padStart(4, '0')}` +
    `${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  )
}

/** Échappe une valeur texte selon la RFC 5545. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

/**
 * Plie une ligne à 75 octets au plus, comme exigé par le format iCalendar.
 * Le pliage tient compte de l'UTF-8 : un caractère accentué compte deux octets.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let currentBytes = 0

  for (const character of line) {
    const characterBytes = encoder.encode(character).length
    const limit = parts.length === 0 ? 75 : 74

    if (currentBytes + characterBytes > limit) {
      parts.push(current)
      current = character
      currentBytes = characterBytes
    } else {
      current += character
      currentBytes += characterBytes
    }
  }

  parts.push(current)

  return parts.join('\r\n ')
}

function line(name: string, value: string): string {
  return foldIcsLine(`${name}:${value}`)
}

function eventLines(input: {
  uid: string
  stamp: string
  start: string
  end: string
  summary: string
  description?: string
  category?: string
  rrule?: string
  exdates?: readonly string[]
  allDay?: boolean
}): string[] {
  const lines: string[] = [
    'BEGIN:VEVENT',
    line('UID', input.uid),
    line('DTSTAMP', input.stamp),
    `${input.allDay === true ? 'DTSTART;VALUE=DATE' : 'DTSTART'}:${input.start}`,
    `${input.allDay === true ? 'DTEND;VALUE=DATE' : 'DTEND'}:${input.end}`,
    line('SUMMARY', escapeIcsText(input.summary))
  ]

  if (input.description !== undefined && input.description.length > 0) {
    lines.push(line('DESCRIPTION', escapeIcsText(input.description)))
  }

  if (input.category !== undefined && input.category.length > 0) {
    lines.push(line('CATEGORIES', escapeIcsText(input.category)))
  }

  if (input.rrule !== undefined && input.rrule.length > 0) {
    lines.push(line('RRULE', input.rrule))
  }

  if (input.exdates !== undefined && input.exdates.length > 0) {
    lines.push(line('EXDATE', input.exdates.join(',')))
  }

  lines.push('END:VEVENT')
  return lines
}

function categoryName(
  categoryId: string | null,
  categoriesById: ReadonlyMap<string, Category>
): string | undefined {
  if (categoryId === null) return undefined

  return categoriesById.get(categoryId)?.name
}

function itemDescription(item: Item): string {
  return item.notes.trim()
}

function normalizedRrule(rrule: string): string {
  return rrule.trim().replace(/^RRULE:/i, '')
}

/**
 * Construit un calendrier iCalendar complet : blocs datés, épreuves sans
 * heure et modèles de semaine type avec leurs exceptions. Les heures sont
 * volontairement « flottantes » (sans fuseau), comme le stockage de l'app.
 */
export function buildCalendarIcs(input: CalendarExportInput): string {
  const stamp = formatIcsUtc(input.now ?? new Date())
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]))
  const activeItems = new Map(
    input.items.filter((item) => item.deletedAt === null).map((item) => [item.id, item] as const)
  )
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    line('PRODID', PRODUCT_ID),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    line('X-WR-CALNAME', CALENDAR_NAME)
  ]

  for (const block of input.blocks) {
    if (block.deletedAt !== null) continue

    const item = activeItems.get(block.itemId)

    if (item === undefined) continue

    const category = categoryName(item.categoryId, categoriesById)
    const description = itemDescription(item)

    if (block.startMin === null) {
      lines.push(
        ...eventLines({
          uid: `${block.id}${TEMPLATE_UID_SUFFIX}`,
          stamp,
          start: formatIcsDate(block.date),
          end: formatIcsDate(addDays(block.date, 1)),
          summary: item.title,
          description,
          category,
          allDay: true
        })
      )
      continue
    }

    const start = formatIcsDateTime(block.date, block.startMin)
    const end = formatIcsEventEnd(block.date, block.startMin + block.durationMin)

    lines.push(
      ...eventLines({
        uid: `${block.id}${TEMPLATE_UID_SUFFIX}`,
        stamp,
        start,
        end,
        summary: item.title,
        description,
        category
      })
    )
  }

  const activeTemplates = input.templates.filter((template) => template.deletedAt === null)
  const activeOverrides = input.overrides.filter((override) => override.deletedAt === null)

  for (const template of activeTemplates) {
    const searchEnd =
      template.validUntil !== null &&
      template.validUntil < addDays(template.validFrom, FIRST_OCCURRENCE_SEARCH_DAYS)
        ? template.validUntil
        : addDays(template.validFrom, FIRST_OCCURRENCE_SEARCH_DAYS)
    const occurrences = computeOccurrences([template], activeOverrides, {
      start: template.validFrom,
      end: searchEnd
    })

    if (occurrences.length === 0) continue

    const firstDate = occurrences[0].date
    const exdates: string[] = []
    const modifiedOverrides: Override[] = []

    for (const override of activeOverrides) {
      if (override.templateId !== template.id) continue

      exdates.push(formatIcsDateTime(override.date, template.startMin))

      if (override.action === 'modify') {
        modifiedOverrides.push(override)
      }
    }

    const startMin = template.startMin
    const rrule = normalizedRrule(template.rrule)
    const rruleWithUntil =
      template.validUntil === null
        ? rrule
        : `${rrule.replace(/;?UNTIL=[^;]*/i, '')};UNTIL=${formatIcsDate(template.validUntil)}T235959`
    const start = formatIcsDateTime(firstDate, startMin)
    const end = formatIcsEventEnd(firstDate, startMin + template.durationMin)

    lines.push(
      ...eventLines({
        uid: `${template.id}${TEMPLATE_UID_SUFFIX}`,
        stamp,
        start,
        end,
        summary: template.title,
        category: categoryName(template.categoryId, categoriesById),
        rrule: rruleWithUntil,
        exdates
      })
    )

    for (const override of modifiedOverrides) {
      const effectiveStart = override.startMin ?? template.startMin
      const effectiveDuration = override.durationMin ?? template.durationMin
      const effectiveTitle = override.title ?? template.title
      const effectiveCategoryId = override.categoryId

      lines.push(
        ...eventLines({
          uid: `${override.id}${TEMPLATE_UID_SUFFIX}`,
          stamp,
          start: formatIcsDateTime(override.date, effectiveStart),
          end: formatIcsEventEnd(override.date, effectiveStart + effectiveDuration),
          summary: effectiveTitle,
          category: categoryName(effectiveCategoryId, categoriesById)
        })
      )
    }
  }

  lines.push('END:VCALENDAR')

  return `${lines.join('\r\n')}\r\n`
}
