import type { LocalDate } from './types'

/** Nombre de minutes dans une journée complète. */
export const MINUTES_PER_DAY = 24 * 60

/** Pas de déplacement et d'accrochage de la grille, en minutes. */
export const SNAP_MINUTES = 15

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^(\d{2}):(\d{2})$/

function pad2(value: number): string {
  return String(value).padStart(2, '0')
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

/** Index du jour dans la semaine : 0 = lundi, 6 = dimanche. */
export function getWeekdayIndex(date: LocalDate): number {
  return (parseLocalDate(date).getDay() + 6) % 7
}

/** Lundi de la semaine contenant `date`. */
export function getWeekStart(date: LocalDate): LocalDate {
  return addDays(date, -getWeekdayIndex(date))
}

/** Dimanche de la semaine contenant `date`. */
export function getWeekEnd(date: LocalDate): LocalDate {
  return addDays(getWeekStart(date), 6)
}

/** Les sept dates de la semaine, du lundi au dimanche. */
export function getWeekDays(date: LocalDate): LocalDate[] {
  const start = getWeekStart(date)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** Bornes inclusives de la semaine contenant `date`. */
export function getWeekRange(date: LocalDate): { start: LocalDate; end: LocalDate } {
  return { start: getWeekStart(date), end: getWeekEnd(date) }
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
