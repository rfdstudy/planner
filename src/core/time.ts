import type { LocalDate } from './types'

/** Nombre de minutes dans une journée complète. */
export const MINUTES_PER_DAY = 24 * 60

/** Pas de déplacement et d'accrochage de la grille, en minutes. */
export const SNAP_MINUTES = 15

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^(\d{2}):(\d{2})$/

const WEEKDAY_SHORT_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})
const MONTH_LONG_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'long' })
const MONTH_SHORT_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
const DAY_LABEL_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function utcDayNumber(date: LocalDate): number {
  const parsed = parseLocalDate(date)
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86_400_000
}

/**
 * Convertit une date locale `YYYY-MM-DD` en `Date` à minuit dans le fuseau du
 * poste. La date est validée de façon stricte (pas de 30 février).
 */
export function parseLocalDate(value: LocalDate): Date {
  const match = LOCAL_DATE_PATTERN.exec(value)

  if (match === null) {
    throw new RangeError(`Date locale invalide : ${value}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError(`Date locale invalide : ${value}`)
  }

  return date
}

/** Convertit un `Date` en date locale `YYYY-MM-DD` dans le fuseau du poste. */
export function formatLocalDate(date: Date): LocalDate {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Date invalide.')
  }

  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())

  return `${String(year).padStart(4, '0')}-${month}-${day}`
}

/** Indique si une chaîne est une date locale valide. */
export function isLocalDate(value: string): value is LocalDate {
  try {
    parseLocalDate(value)
    return true
  } catch {
    return false
  }
}

/** Date locale du jour dans le fuseau du poste. */
export function todayLocalDate(now: Date = new Date()): LocalDate {
  return formatLocalDate(now)
}

/**
 * Ajoute un nombre de jours calendaires. On passe par les composantes locales
 * plutôt que par 86 400 000 ms pour rester juste lors des changements d'heure.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) {
    throw new RangeError('Le nombre de jours doit être un entier.')
  }

  const result = parseLocalDate(date)
  result.setDate(result.getDate() + days)
  return formatLocalDate(result)
}

/**
 * Index du jour dans la semaine : 0 = lundi, 6 = dimanche.
 * L'index ne dépend pas du premier jour choisi dans les réglages.
 */
export function getWeekdayIndex(date: LocalDate): number {
  return (parseLocalDate(date).getDay() + 6) % 7
}

/** Vérifie qu'un premier jour de semaine est un index de 0 à 6. */
export function isWeekStartsOn(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 6
}

/**
 * Premier jour de la semaine contenant `date`. `weekStartsOn` suit l'index
 * français (0 = lundi, 6 = dimanche) et vaut lundi par défaut.
 */
export function getWeekStart(date: LocalDate, weekStartsOn: number = 0): LocalDate {
  if (!isWeekStartsOn(weekStartsOn)) {
    throw new RangeError('Le premier jour de la semaine doit être compris entre 0 et 6.')
  }

  const offset = (getWeekdayIndex(date) - weekStartsOn + 7) % 7
  return addDays(date, -offset)
}

/** Dernier jour de la semaine contenant `date`. */
export function getWeekEnd(date: LocalDate, weekStartsOn: number = 0): LocalDate {
  return addDays(getWeekStart(date, weekStartsOn), 6)
}

/** Les sept dates de la semaine, à partir du premier jour choisi. */
export function getWeekDays(date: LocalDate, weekStartsOn: number = 0): LocalDate[] {
  const start = getWeekStart(date, weekStartsOn)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** Bornes inclusives de la semaine contenant `date`. */
export function getWeekRange(
  date: LocalDate,
  weekStartsOn: number = 0
): { start: LocalDate; end: LocalDate } {
  return { start: getWeekStart(date, weekStartsOn), end: getWeekEnd(date, weekStartsOn) }
}

/** Nom court du jour en français, sans point final (`lun`, `mar`…). */
export function formatWeekdayShort(date: LocalDate): string {
  return WEEKDAY_SHORT_FORMAT.format(parseLocalDate(date)).replace(/\.$/, '')
}

/** Date longue française, sans année (`lundi 9 novembre`). */
export function formatLongDate(date: LocalDate): string {
  return LONG_DATE_FORMAT.format(parseLocalDate(date))
}

/** Date complète de la vue Jour (`mercredi 12 novembre 2026`). */
export function formatDayLabel(date: LocalDate): string {
  return DAY_LABEL_FORMAT.format(parseLocalDate(date))
}

/**
 * Libellé d'une semaine du lundi au dimanche, par exemple « 9 – 15 novembre
 * 2026 ». Les mois sont abrégés lorsque la semaine traverse deux mois.
 */
export function formatWeekLabel(date: LocalDate, weekStartsOn: number = 0): string {
  const start = parseLocalDate(getWeekStart(date, weekStartsOn))
  const end = parseLocalDate(getWeekEnd(date, weekStartsOn))
  const startYear = start.getFullYear()
  const endYear = end.getFullYear()

  if (startYear !== endYear) {
    return `${start.getDate()} ${MONTH_SHORT_FORMAT.format(start)} ${startYear} – ${end.getDate()} ${MONTH_SHORT_FORMAT.format(end)} ${endYear}`
  }

  if (start.getMonth() !== end.getMonth()) {
    return `${start.getDate()} ${MONTH_SHORT_FORMAT.format(start)} – ${end.getDate()} ${MONTH_SHORT_FORMAT.format(end)} ${startYear}`
  }

  return `${start.getDate()} – ${end.getDate()} ${MONTH_LONG_FORMAT.format(start)} ${startYear}`
}

/** Nombre de jours calendaires de `from` vers `to` (négatif si `to` précède). */
export function differenceInCalendarDays(from: LocalDate, to: LocalDate): number {
  return Math.round(utcDayNumber(to) - utcDayNumber(from))
}

/**
 * Échéance relative à `referenceDate` : « J-3 » dans trois jours,
 * « Aujourd'hui » le jour même, « J+2 » deux jours après.
 */
export function formatDaysUntil(
  targetDate: LocalDate,
  referenceDate: LocalDate = todayLocalDate()
): string {
  const days = differenceInCalendarDays(referenceDate, targetDate)

  if (days === 0) return "Aujourd'hui"
  if (days > 0) return `J-${days}`

  return `J+${Math.abs(days)}`
}

/** Formate des minutes depuis minuit en `HH:MM` (1440 donne `24:00`). */
export function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new RangeError(`Minutes hors de la journée : ${minutes}`)
  }

  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
}

/** Lit une heure `HH:MM` et renvoie les minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time)

  if (match === null) {
    throw new RangeError(`Heure invalide : ${time}`)
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) {
    throw new RangeError(`Heure invalide : ${time}`)
  }

  return hours * 60 + minutes
}

/**
 * Accroche une position sur le pas demandé (15 minutes par défaut), au plus
 * proche. Le résultat n'est pas borné à la journée : utilisez `clampMinutes`.
 */
export function snapMinutes(minutes: number, step: number = SNAP_MINUTES): number {
  if (!Number.isInteger(minutes)) {
    throw new RangeError('Les minutes doivent être un entier.')
  }

  if (!Number.isInteger(step) || step <= 0) {
    throw new RangeError('Le pas doit être un entier strictement positif.')
  }

  return Math.round(minutes / step) * step
}

/** Borne une valeur entre `min` et `max` (0 et 1440 par défaut). */
export function clampMinutes(
  minutes: number,
  min: number = 0,
  max: number = MINUTES_PER_DAY
): number {
  if (min > max) {
    throw new RangeError('La borne minimale dépasse la borne maximale.')
  }

  return Math.min(max, Math.max(min, minutes))
}

/**
 * Formate une durée en minutes pour l'affichage : « 45 min », « 1 h »,
 * « 1 h 30 ».
 */
export function formatDurationMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`Durée invalide : ${minutes}`)
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours === 0) return `${remainingMinutes} min`
  if (remainingMinutes === 0) return `${hours} h`

  return `${hours} h ${remainingMinutes}`
}

/**
 * Lit une durée entière positive saisie en minutes. Renvoie `null` si la
 * saisie est vide, négative ou non entière.
 */
export function parsePositiveMinutes(value: string): number | null {
  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) return null

  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
