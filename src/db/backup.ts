import {
  createDefaultItemTypes,
  defaultItemTypeIdForKind,
  defaultTemplateTypeIdForKind,
  isItemTypePlacement,
  isItemTypeStyle
} from '../core/itemTypes'
import { isLocalDate, formatLocalDate } from '../core/time'
import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  ItemType,
  JsonValue,
  Override,
  Setting,
  Template
} from '../core/types'
import { DATABASE_VERSION, LEGACY_DATABASE_VERSION } from './database'
import type { BackupData, Repositories } from './repositories'

/** Marqueur permettant de reconnaître une sauvegarde Planner. */
export const BACKUP_FORMAT = 'planner-backup'

export type { BackupData }

/** Sauvegarde JSON complète, y compris les enregistrements supprimés. */
export interface PlannerBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: BackupData
}

/** Erreur lisible lorsqu'un fichier ne respecte pas le format attendu. */
export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupFormatError'
  }
}

type UnknownRecord = Record<string, unknown>

interface LegacyItem extends Omit<Item, 'typeId'> {
  kind: string
}

interface LegacyTemplate extends Omit<Template, 'typeId'> {
  kind: string
}

interface LegacyOverride extends Omit<Override, 'typeId'> {
  typeId?: string | null
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function isNullableIsoDateTime(value: unknown): value is string | null {
  return value === null || isIsoDateTime(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isBaseRecord(value: UnknownRecord): boolean {
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isIsoDateTime(value.createdAt) &&
    isIsoDateTime(value.updatedAt) &&
    isNullableIsoDateTime(value.deletedAt)
  )
}

function isJsonValue(value: unknown, depth: number = 0): value is JsonValue {
  if (depth > 20) return false
  if (value === null) return true

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value !== 'number' || Number.isFinite(value)
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, depth + 1))
  }

  if (isRecord(value)) {
    return Object.values(value).every((entry) => isJsonValue(entry, depth + 1))
  }

  return false
}

function isCategoryGroup(value: unknown): value is CategoryGroup {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.order === 'number' &&
    Number.isInteger(value.order)
  )
}

function isCategory(value: unknown): value is Category {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.color === 'string' &&
    value.color.length > 0 &&
    isNullableString(value.groupId) &&
    typeof value.order === 'number' &&
    Number.isInteger(value.order) &&
    isNullableIsoDateTime(value.archivedAt)
  )
}

function isItemType(value: unknown): value is ItemType {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.order === 'number' &&
    Number.isInteger(value.order) &&
    isNullableIsoDateTime(value.archivedAt) &&
    isItemTypeStyle(value.style) &&
    isNullableString(value.color) &&
    typeof value.isTask === 'boolean' &&
    typeof value.countdown === 'boolean' &&
    isItemTypePlacement(value.placement)
  )
}

function hasValidItemFields(value: UnknownRecord): boolean {
  const status = value.status

  return (
    typeof value.title === 'string' &&
    typeof value.notes === 'string' &&
    isNullableString(value.categoryId) &&
    (value.estimateMin === null ||
      isIntegerBetween(value.estimateMin, 1, Number.MAX_SAFE_INTEGER)) &&
    (status === null || status === 'todo' || status === 'done') &&
    isNullableString(value.templateId)
  )
}

function isItemV2(value: unknown): value is Item {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    typeof value.typeId === 'string' &&
    value.typeId.length > 0 &&
    hasValidItemFields(value)
  )
}

function isLegacyItem(value: unknown): value is LegacyItem {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    (value.kind === 'fixed' ||
      value.kind === 'task' ||
      value.kind === 'exam' ||
      value.kind === 'free') &&
    hasValidItemFields(value)
  )
}

function hasValidBlockEndDate(value: UnknownRecord): boolean {
  if (value.endDate === undefined || value.endDate === null) return true
  if (typeof value.endDate !== 'string' || !isLocalDate(value.endDate)) return false
  if (typeof value.date !== 'string' || !isLocalDate(value.date)) return false

  // Une date de fin n'a de sens que pour un élément sans heure, et elle ne
  // peut pas précéder le début de la période.
  return value.startMin === null && value.endDate >= value.date
}

function isBlock(value: unknown): value is Block {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    typeof value.itemId === 'string' &&
    value.itemId.length > 0 &&
    typeof value.date === 'string' &&
    isLocalDate(value.date) &&
    (value.startMin === null || isIntegerBetween(value.startMin, 0, 1439)) &&
    isIntegerBetween(value.durationMin, 1, 1440) &&
    hasValidBlockEndDate(value)
  )
}

function hasValidTemplateFields(value: UnknownRecord): boolean {
  return (
    typeof value.title === 'string' &&
    isNullableString(value.categoryId) &&
    typeof value.rrule === 'string' &&
    value.rrule.trim().length > 0 &&
    isIntegerBetween(value.startMin, 0, 1439) &&
    isIntegerBetween(value.durationMin, 1, 1440) &&
    typeof value.validFrom === 'string' &&
    isLocalDate(value.validFrom) &&
    (value.validUntil === null ||
      (typeof value.validUntil === 'string' && isLocalDate(value.validUntil)))
  )
}

function isTemplateV2(value: unknown): value is Template {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    typeof value.typeId === 'string' &&
    value.typeId.length > 0 &&
    hasValidTemplateFields(value)
  )
}

function isLegacyTemplate(value: unknown): value is LegacyTemplate {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    (value.kind === 'fixed' || value.kind === 'free') &&
    hasValidTemplateFields(value)
  )
}

function hasValidOverrideFields(value: UnknownRecord): boolean {
  return (
    typeof value.templateId === 'string' &&
    value.templateId.length > 0 &&
    typeof value.date === 'string' &&
    isLocalDate(value.date) &&
    (value.action === 'skip' || value.action === 'modify') &&
    isNullableString(value.title) &&
    isNullableString(value.categoryId) &&
    (value.startMin === null || isIntegerBetween(value.startMin, 0, 1439)) &&
    (value.durationMin === null || isIntegerBetween(value.durationMin, 1, 1440))
  )
}

function isOverrideV2(value: unknown): value is Override {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    hasValidOverrideFields(value) &&
    (value.typeId === undefined || isNullableString(value.typeId))
  )
}

function isLegacyOverride(value: unknown): value is LegacyOverride {
  return isRecord(value) && isBaseRecord(value) && hasValidOverrideFields(value)
}

function isSetting(value: unknown): value is Setting {
  return (
    isRecord(value) &&
    isBaseRecord(value) &&
    typeof value.key === 'string' &&
    value.key.length > 0 &&
    isJsonValue(value.value)
  )
}

function readTable<T>(
  value: unknown,
  label: string,
  guard: (entry: unknown) => entry is T,
  uniqueKey: (entry: T) => string = (entry) => (entry as { id: string }).id
): T[] {
  if (!Array.isArray(value)) {
    throw new BackupFormatError(`La table « ${label} » est absente ou invalide.`)
  }

  const seen = new Set<string>()
  const records: T[] = []

  for (const [index, entry] of value.entries()) {
    if (!guard(entry)) {
      throw new BackupFormatError(`Entrée invalide dans « ${label} » (n° ${index + 1}).`)
    }

    const key = uniqueKey(entry)

    if (seen.has(key)) {
      throw new BackupFormatError(`Identifiant en double dans « ${label} » : ${key}.`)
    }

    seen.add(key)
    records.push(entry)
  }

  return records
}

function readDataV2(value: unknown): BackupData {
  if (!isRecord(value)) {
    throw new BackupFormatError('Les données de la sauvegarde sont absentes.')
  }

  return {
    categoryGroups: readTable(value.categoryGroups, 'groupes', isCategoryGroup),
    categories: readTable(value.categories, 'catégories', isCategory),
    itemTypes: readTable(value.itemTypes, 'types d’éléments', isItemType),
    items: readTable(value.items, 'éléments', isItemV2),
    blocks: readTable(value.blocks, 'blocs', isBlock).map((block) => ({
      ...block,
      endDate: block.endDate ?? null
    })),
    templates: readTable(value.templates, 'modèles', isTemplateV2),
    overrides: readTable(value.overrides, 'exceptions', isOverrideV2).map((override) => ({
      ...override,
      typeId: override.typeId ?? null
    })),
    settings: readTable(value.settings, 'réglages', isSetting, (setting) => setting.key)
  }
}

/**
 * Convertit une sauvegarde du schéma historique (version 1). Les éléments et
 * modèles reçoivent le type équivalent ; les cinq types de départ sont créés.
 */
function readDataV1(value: unknown, exportedAt: string): BackupData {
  if (!isRecord(value)) {
    throw new BackupFormatError('Les données de la sauvegarde sont absentes.')
  }

  const legacyItems = readTable(value.items, 'éléments', isLegacyItem)
  const legacyTemplates = readTable(value.templates, 'modèles', isLegacyTemplate)
  const legacyOverrides = readTable(value.overrides, 'exceptions', isLegacyOverride)

  return {
    categoryGroups: readTable(value.categoryGroups, 'groupes', isCategoryGroup),
    categories: readTable(value.categories, 'catégories', isCategory),
    itemTypes: createDefaultItemTypes(exportedAt),
    items: legacyItems.map(({ kind, ...item }) => ({
      ...item,
      typeId: defaultItemTypeIdForKind(kind)
    })),
    blocks: readTable(value.blocks, 'blocs', isBlock).map((block) => ({
      ...block,
      endDate: block.endDate ?? null
    })),
    templates: legacyTemplates.map(({ kind, ...template }) => ({
      ...template,
      typeId: defaultTemplateTypeIdForKind(kind)
    })),
    overrides: legacyOverrides.map((override) => ({
      ...override,
      typeId: override.typeId ?? null
    })),
    settings: readTable(value.settings, 'réglages', isSetting, (setting) => setting.key)
  }
}

/**
 * Lit et vérifie une sauvegarde JSON avant de proposer son import. Les
 * sauvegardes du schéma historique sont converties à la volée.
 */
export function parseBackup(text: string): PlannerBackup {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    throw new BackupFormatError('Le fichier n’est pas un JSON valide.')
  }

  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('Ce fichier n’est pas une sauvegarde Planner.')
  }

  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) {
    throw new BackupFormatError('La version de la sauvegarde est invalide.')
  }

  if (value.version !== LEGACY_DATABASE_VERSION && value.version !== DATABASE_VERSION) {
    throw new BackupFormatError(
      `Version de sauvegarde non prise en charge (${value.version}). Cette version de Planner lit les versions ${LEGACY_DATABASE_VERSION} et ${DATABASE_VERSION}.`
    )
  }

  if (!isIsoDateTime(value.exportedAt)) {
    throw new BackupFormatError('La date d’export de la sauvegarde est invalide.')
  }

  const data =
    value.version === LEGACY_DATABASE_VERSION
      ? readDataV1(value.data, value.exportedAt)
      : readDataV2(value.data)

  return {
    format: BACKUP_FORMAT,
    version: DATABASE_VERSION,
    exportedAt: value.exportedAt,
    data
  }
}

/**
 * Lit toutes les tables en incluant les suppressions logiques : une sauvegarde
 * doit pouvoir restaurer l'état exact, pas seulement les lignes visibles.
 */
export async function createBackup(
  repositories: Repositories,
  exportedAt: Date = new Date()
): Promise<PlannerBackup> {
  const [categoryGroups, categories, itemTypes, items, blocks, templates, overrides, settings] =
    await Promise.all([
      repositories.categoryGroups.list({ includeDeleted: true }),
      repositories.categories.list({ includeDeleted: true }),
      repositories.itemTypes.list({ includeDeleted: true }),
      repositories.items.list({ includeDeleted: true }),
      repositories.blocks.list({ includeDeleted: true }),
      repositories.templates.list({ includeDeleted: true }),
      repositories.overrides.list({ includeDeleted: true }),
      repositories.settings.list({ includeDeleted: true })
    ])

  return {
    format: BACKUP_FORMAT,
    version: DATABASE_VERSION,
    exportedAt: exportedAt.toISOString(),
    data: { categoryGroups, categories, itemTypes, items, blocks, templates, overrides, settings }
  }
}

/** Sérialise la sauvegarde avec une indentation lisible. */
export function serializeBackup(backup: PlannerBackup): string {
  return JSON.stringify(backup, null, 2)
}

/** Remplace toutes les données par le contenu d'une sauvegarde vérifiée. */
export async function importBackup(
  repositories: Repositories,
  backup: PlannerBackup
): Promise<void> {
  await repositories.backup.replaceAll(backup.data)
  repositories.history.clear()
}

/** Nom de fichier daté proposé par la boîte d'enregistrement. */
export function backupFileName(date: Date = new Date()): string {
  return `planner-sauvegarde-${formatLocalDate(date)}.json`
}
