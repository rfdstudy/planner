import { isItemTypeStyle } from '../core/itemTypes'
import {
  PHONE_SNAPSHOT_VERSION,
  type PhoneSnapshot,
  type PhoneSnapshotAllDay,
  type PhoneSnapshotBlock,
  type PhoneSnapshotDay
} from '../core/phoneSnapshot'
import { isLocalDate } from '../core/time'
import type { ItemTypeStyle } from '../core/types'

/** Clé localStorage : quelques dizaines de kilo-octets suffisent. */
export const PHONE_SNAPSHOT_STORAGE_KEY = 'planner-phone.snapshot'

/** Un instantané plus vieux que 24 heures est signalé à l'utilisateur. */
export const PHONE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

const SNAPSHOT_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short'
})
const SNAPSHOT_TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit'
})

type UnknownRecord = Record<string, unknown>

export class PhoneSnapshotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhoneSnapshotError'
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isMinute(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
  )
}

function readText(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new PhoneSnapshotError(`Le champ « ${label} » est invalide dans l’instantané.`)
  }

  return value
}

function readNullableText(value: unknown, label: string): string | null {
  if (!isNullableString(value)) {
    throw new PhoneSnapshotError(`Le champ « ${label} » est invalide dans l’instantané.`)
  }

  return value
}

function readStyle(value: unknown): ItemTypeStyle {
  if (!isItemTypeStyle(value)) {
    throw new PhoneSnapshotError('Un style de type est invalide dans l’instantané.')
  }

  return value
}

function readAllDay(value: unknown): PhoneSnapshotAllDay {
  if (!isRecord(value)) {
    throw new PhoneSnapshotError('Un élément de journée entière est invalide.')
  }

  return {
    title: readText(value.title, 'titre'),
    typeName: readText(value.typeName, 'nom du type'),
    typeStyle: readStyle(value.typeStyle),
    color: readNullableText(value.color, 'couleur'),
    categoryName: readNullableText(value.categoryName, 'catégorie'),
    countdown: readNullableText(value.countdown, 'compte à rebours'),
    period: readNullableText(value.period, 'période'),
    notes: readText(value.notes, 'notes')
  }
}

function readBlock(value: unknown): PhoneSnapshotBlock {
  if (!isRecord(value)) {
    throw new PhoneSnapshotError('Un bloc horaire est invalide.')
  }

  if (!isMinute(value.startMin, 0, 1439)) {
    throw new PhoneSnapshotError('Une heure de début est invalide dans l’instantané.')
  }

  if (!isMinute(value.endMin, 1, 1440) || value.endMin <= value.startMin) {
    throw new PhoneSnapshotError('Une heure de fin est invalide dans l’instantané.')
  }

  if (typeof value.done !== 'boolean') {
    throw new PhoneSnapshotError('L’état d’une tâche est invalide dans l’instantané.')
  }

  return {
    title: readText(value.title, 'titre'),
    startMin: value.startMin,
    endMin: value.endMin,
    typeName: readText(value.typeName, 'nom du type'),
    typeStyle: readStyle(value.typeStyle),
    color: readNullableText(value.color, 'couleur'),
    categoryName: readNullableText(value.categoryName, 'catégorie'),
    done: value.done,
    notes: readText(value.notes, 'notes')
  }
}

function readDay(value: unknown): PhoneSnapshotDay {
  if (!isRecord(value)) {
    throw new PhoneSnapshotError('Un jour est invalide dans l’instantané.')
  }

  if (typeof value.date !== 'string' || !isLocalDate(value.date)) {
    throw new PhoneSnapshotError('Une date est invalide dans l’instantané.')
  }

  if (!Array.isArray(value.allDay) || !Array.isArray(value.blocks)) {
    throw new PhoneSnapshotError('La liste d’un jour est invalide dans l’instantané.')
  }

  return {
    date: value.date,
    allDay: value.allDay.map(readAllDay),
    blocks: value.blocks.map(readBlock)
  }
}

/**
 * Lit un instantané et vérifie son format avant de remplacer les données du
 * téléphone. Le numéro de version est le seul contrat entre le PC et l'iPhone.
 */
export function parsePhoneSnapshot(text: string): PhoneSnapshot {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    throw new PhoneSnapshotError('Le fichier n’est pas un JSON valide.')
  }

  if (!isRecord(value)) {
    throw new PhoneSnapshotError('Ce fichier n’est pas un instantané Planner.')
  }

  if (typeof value.snapshotVersion !== 'number' || !Number.isInteger(value.snapshotVersion)) {
    throw new PhoneSnapshotError('Ce fichier n’est pas un instantané Planner.')
  }

  if (value.snapshotVersion !== PHONE_SNAPSHOT_VERSION) {
    throw new PhoneSnapshotError(
      `Version d’instantané non prise en charge (${value.snapshotVersion}). Mettez à jour l’application téléphone.`
    )
  }

  if (typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new PhoneSnapshotError('La date de génération de l’instantané est invalide.')
  }

  if (
    typeof value.rangeStart !== 'string' ||
    !isLocalDate(value.rangeStart) ||
    typeof value.rangeEnd !== 'string' ||
    !isLocalDate(value.rangeEnd)
  ) {
    throw new PhoneSnapshotError('La période de l’instantané est invalide.')
  }

  if (!Array.isArray(value.days) || value.days.length === 0) {
    throw new PhoneSnapshotError('L’instantané ne contient aucun jour.')
  }

  const seenDates = new Set<string>()
  const days = value.days.map((day) => {
    const parsed = readDay(day)

    if (seenDates.has(parsed.date)) {
      throw new PhoneSnapshotError(`Le jour ${parsed.date} apparaît deux fois dans l’instantané.`)
    }

    seenDates.add(parsed.date)
    return parsed
  })

  return {
    snapshotVersion: PHONE_SNAPSHOT_VERSION,
    generatedAt: value.generatedAt,
    rangeStart: value.rangeStart,
    rangeEnd: value.rangeEnd,
    days
  }
}

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(PHONE_SNAPSHOT_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Lit l'instantané mémorisé, ou `null` si le stockage est vide ou illisible. */
export function loadPhoneSnapshot(): PhoneSnapshot | null {
  const stored = readStorage()

  if (stored === null) return null

  try {
    return parsePhoneSnapshot(stored)
  } catch {
    return null
  }
}

/** Remplace l'instantané mémorisé. Les erreurs de quota sont laissées à l'appelant. */
export function savePhoneSnapshot(snapshot: PhoneSnapshot): void {
  window.localStorage.setItem(PHONE_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
}

/**
 * Demande un stockage persistant pour éviter qu'iOS n'efface les données.
 * L'API est facultative : son absence ou son refus ne bloque jamais l'app.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    const storage = navigator.storage

    if (storage === undefined || typeof storage.persist !== 'function') return

    if (typeof storage.persisted === 'function' && (await storage.persisted())) return

    await storage.persist()
  } catch {
    // Safari peut refuser sans erreur visible : le stockage local reste utilisé.
  }
}

/** Vrai lorsque l'instantané date de plus de 24 heures. */
export function isPhoneSnapshotStale(snapshot: PhoneSnapshot, now: Date = new Date()): boolean {
  const generatedAt = Date.parse(snapshot.generatedAt)

  if (Number.isNaN(generatedAt)) return false

  return now.getTime() - generatedAt > PHONE_SNAPSHOT_MAX_AGE_MS
}

/** « 12 nov. à 20:15 », comme demandé dans l'en-tête du téléphone. */
export function formatPhoneSnapshotMoment(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return `${SNAPSHOT_DATE_FORMAT.format(date)} à ${SNAPSHOT_TIME_FORMAT.format(date)}`
}
