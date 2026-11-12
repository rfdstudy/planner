import { fallbackItemType } from './itemTypes'
import { computeOccurrences } from './recurrence'
import { blockOccursOn, getBlockEndDate, isMultiDayBlock } from './schedule'
import { MINUTES_PER_DAY, addDays, formatCountdown, isLocalDate, parseLocalDate } from './time'
import type {
  Block,
  Category,
  Item,
  ItemType,
  ItemTypeStyle,
  LocalDate,
  Override,
  Template
} from './types'

/**
 * Version du format d'instantané lu par l'application téléphone. Elle est
 * indépendante de la version du schéma Dexie : un changement de base ne doit
 * jamais casser le téléphone.
 */
export const PHONE_SNAPSHOT_VERSION = 1

/** Nom fixe du fichier proposé dans la boîte d'enregistrement du PC. */
export const PHONE_SNAPSHOT_FILE_NAME = 'planner-telephone.json'

/** Fenêtre exportée : la veille, aujourd'hui et les trois semaines à venir. */
export const PHONE_SNAPSHOT_DAYS_BEFORE = 1
export const PHONE_SNAPSHOT_DAYS_AFTER = 21

/** Bloc horaire déjà calculé, sans aucun identifiant interne. */
export interface PhoneSnapshotBlock {
  title: string
  /** Début en minutes depuis minuit. */
  startMin: number
  /** Fin en minutes depuis minuit. */
  endMin: number
  typeName: string
  typeStyle: ItemTypeStyle
  /** Couleur de catégorie ou couleur propre du type, si elle s'applique. */
  color: string | null
  categoryName: string | null
  done: boolean
  /** Notes au format Markdown, cases à cocher comprises. */
  notes: string
}

/** Élément de la ligne du haut, sans heure. */
export interface PhoneSnapshotAllDay {
  title: string
  typeName: string
  typeStyle: ItemTypeStyle
  color: string | null
  categoryName: string | null
  /** « J-3 », « en cours »… calculé à la génération. */
  countdown: string | null
  /** « du 11 au 13 nov. » pour un élément multi-jours. */
  period: string | null
  notes: string
}

export interface PhoneSnapshotDay {
  date: LocalDate
  allDay: PhoneSnapshotAllDay[]
  blocks: PhoneSnapshotBlock[]
}

/** Instantané complet, autonome et sans référence à la base du PC. */
export interface PhoneSnapshot {
  snapshotVersion: number
  generatedAt: string
  rangeStart: LocalDate
  rangeEnd: LocalDate
  days: PhoneSnapshotDay[]
}

export interface PhoneSnapshotInput {
  today: LocalDate
  generatedAt: string
  categories: readonly Category[]
  itemTypes: readonly ItemType[]
  items: readonly Item[]
  blocks: readonly Block[]
  templates: readonly Template[]
  overrides: readonly Override[]
}

const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

function isActive(record: { deletedAt: string | null }): boolean {
  return record.deletedAt === null
}

/** Couleur réellement affichée pour un couple type / catégorie. */
export function resolvePhoneSnapshotColor(
  type: ItemType,
  category: Category | null
): string | null {
  if (type.style === 'category') return category?.color ?? null
  if (type.style === 'neutral' || type.style === 'free') return type.color
  return null
}

function dayNumber(date: LocalDate): string {
  return String(parseLocalDate(date).getDate())
}

function monthLabel(date: LocalDate): string {
  return MONTH_SHORT_FORMAT.format(parseLocalDate(date))
}

/**
 * Plage lisible d'un élément multi-jours. L'année n'apparaît que si elle change
 * entre le début et la fin, pour garder la ligne du haut compacte.
 */
export function formatPhoneSnapshotPeriod(startDate: LocalDate, endDate: LocalDate): string {
  const startYear = startDate.slice(0, 4)
  const endYear = endDate.slice(0, 4)

  if (startYear !== endYear) {
    return `du ${dayNumber(startDate)} ${monthLabel(startDate)} ${startYear} au ${dayNumber(
      endDate
    )} ${monthLabel(endDate)} ${endYear}`
  }

  if (startDate.slice(5, 7) === endDate.slice(5, 7)) {
    return `du ${dayNumber(startDate)} au ${dayNumber(endDate)} ${monthLabel(endDate)}`
  }

  return `du ${dayNumber(startDate)} ${monthLabel(startDate)} au ${dayNumber(
    endDate
  )} ${monthLabel(endDate)}`
}

function allDayFromBlock(
  block: Block,
  item: Item,
  type: ItemType,
  category: Category | null,
  today: LocalDate
): PhoneSnapshotAllDay {
  const endDate = getBlockEndDate(block)

  return {
    title: item.title,
    typeName: type.name,
    typeStyle: type.style,
    color: resolvePhoneSnapshotColor(type, category),
    categoryName: category?.name ?? null,
    countdown: type.countdown ? formatCountdown(block.date, endDate, today) : null,
    period: isMultiDayBlock(block) ? formatPhoneSnapshotPeriod(block.date, endDate) : null,
    notes: item.notes
  }
}

function allDayFromOccurrence(
  occurrence: {
    date: LocalDate
    title: string
    typeId: string
    categoryId: string | null
  },
  type: ItemType,
  category: Category | null,
  today: LocalDate
): PhoneSnapshotAllDay {
  return {
    title: occurrence.title,
    typeName: type.name,
    typeStyle: type.style,
    color: resolvePhoneSnapshotColor(type, category),
    categoryName: category?.name ?? null,
    countdown: type.countdown ? formatCountdown(occurrence.date, null, today) : null,
    period: null,
    notes: ''
  }
}

function timedBlockFromStored(
  block: Block & { startMin: number },
  item: Item,
  type: ItemType,
  category: Category | null
): PhoneSnapshotBlock {
  return {
    title: item.title,
    startMin: block.startMin,
    endMin: Math.min(MINUTES_PER_DAY, block.startMin + block.durationMin),
    typeName: type.name,
    typeStyle: type.style,
    color: resolvePhoneSnapshotColor(type, category),
    categoryName: category?.name ?? null,
    done: item.status === 'done',
    notes: item.notes
  }
}

/**
 * Développe toute la fenêtre [aujourd'hui - 1 ; aujourd'hui + 21] en listes
 * prêtes à afficher. Les occurrences de la semaine type et leurs exceptions
 * sont calculées ici : le téléphone ne connaît aucune règle de récurrence.
 *
 * Seuls les éléments actifs et les blocs existants sont exportés. Une tâche
 * restée dans « À planifier », sans bloc, n'apparaît donc jamais.
 */
export function createPhoneSnapshot(input: PhoneSnapshotInput): PhoneSnapshot {
  if (!isLocalDate(input.today)) {
    throw new RangeError(`Date locale invalide : ${input.today}`)
  }

  if (Number.isNaN(Date.parse(input.generatedAt))) {
    throw new RangeError('La date de génération de l’instantané est invalide.')
  }

  const rangeStart = addDays(input.today, -PHONE_SNAPSHOT_DAYS_BEFORE)
  const rangeEnd = addDays(input.today, PHONE_SNAPSHOT_DAYS_AFTER)
  const dayCount = PHONE_SNAPSHOT_DAYS_BEFORE + PHONE_SNAPSHOT_DAYS_AFTER + 1
  const days: PhoneSnapshotDay[] = Array.from({ length: dayCount }, (_, index) => ({
    date: addDays(rangeStart, index),
    allDay: [],
    blocks: []
  }))
  const daysByDate = new Map(days.map((day) => [day.date, day]))

  const categoriesById = new Map(
    input.categories.filter(isActive).map((category) => [category.id, category])
  )
  const typesById = new Map(input.itemTypes.filter(isActive).map((type) => [type.id, type]))
  const itemsById = new Map(input.items.filter(isActive).map((item) => [item.id, item]))
  const activeBlocks = input.blocks.filter(isActive)
  const activeTemplates = input.templates.filter(isActive)
  const activeOverrides = input.overrides.filter(isActive)

  for (const block of activeBlocks) {
    if (block.durationMin <= 0) continue

    const item = itemsById.get(block.itemId)

    if (item === undefined) continue

    const type = typesById.get(item.typeId) ?? fallbackItemType(item.typeId)
    const category = item.categoryId === null ? null : (categoriesById.get(item.categoryId) ?? null)

    if (block.startMin === null) {
      for (const day of days) {
        if (blockOccursOn(block, day.date)) {
          day.allDay.push(allDayFromBlock(block, item, type, category, input.today))
        }
      }

      continue
    }

    if (block.startMin >= MINUTES_PER_DAY) continue

    const day = daysByDate.get(block.date)

    if (day !== undefined) {
      day.blocks.push(
        timedBlockFromStored({ ...block, startMin: block.startMin }, item, type, category)
      )
    }
  }

  const occurrences = computeOccurrences(activeTemplates, activeOverrides, {
    start: rangeStart,
    end: rangeEnd
  })

  for (const occurrence of occurrences) {
    const day = daysByDate.get(occurrence.date)

    if (day === undefined) continue

    const type = typesById.get(occurrence.typeId) ?? fallbackItemType(occurrence.typeId)
    const category =
      occurrence.categoryId === null ? null : (categoriesById.get(occurrence.categoryId) ?? null)

    if (type.placement === 'topLine') {
      day.allDay.push(allDayFromOccurrence(occurrence, type, category, input.today))
      continue
    }

    if (occurrence.startMin >= MINUTES_PER_DAY) continue

    day.blocks.push({
      title: occurrence.title,
      startMin: occurrence.startMin,
      endMin: Math.min(MINUTES_PER_DAY, occurrence.startMin + occurrence.durationMin),
      typeName: type.name,
      typeStyle: type.style,
      color: resolvePhoneSnapshotColor(type, category),
      categoryName: category?.name ?? null,
      done: false,
      notes: ''
    })
  }

  for (const day of days) {
    day.blocks.sort((a, b) => a.startMin - b.startMin || a.title.localeCompare(b.title, 'fr'))
    day.allDay.sort((a, b) => {
      const rank = (entry: PhoneSnapshotAllDay): number =>
        entry.typeStyle === 'alert' ? 0 : entry.period !== null ? 1 : 2

      return rank(a) - rank(b) || a.title.localeCompare(b.title, 'fr')
    })
  }

  return {
    snapshotVersion: PHONE_SNAPSHOT_VERSION,
    generatedAt: input.generatedAt,
    rangeStart,
    rangeEnd,
    days
  }
}

/** Sérialise l'instantané avec une indentation lisible dans le fichier. */
export function serializePhoneSnapshot(snapshot: PhoneSnapshot): string {
  return JSON.stringify(snapshot, null, 2)
}
