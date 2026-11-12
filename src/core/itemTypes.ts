import { normalizeCategoryColor, normalizeCategoryName } from './categories'
import type { IsoDateTime, ItemType, ItemTypePlacement, ItemTypeStyle } from './types'

/** Réglage retenant que les types de départ ont déjà été créés. */
export const ITEM_TYPES_INITIALIZED_SETTING_KEY = 'itemTypes.initialized'

export interface ItemTypeStyleOption {
  readonly value: ItemTypeStyle
  readonly label: string
}

/** Styles proposés dans l'écran « Types », dans l'ordre de la charte. */
export const ITEM_TYPE_STYLES: readonly ItemTypeStyleOption[] = [
  { value: 'neutral', label: 'Neutre' },
  { value: 'category', label: 'Catégorie' },
  { value: 'alert', label: 'Alerte' },
  { value: 'free', label: 'Libre' }
]

export interface ItemTypePlacementOption {
  readonly value: ItemTypePlacement
  readonly label: string
}

/** Placements proposés pour un nouveau bloc. */
export const ITEM_TYPE_PLACEMENTS: readonly ItemTypePlacementOption[] = [
  { value: 'grid', label: 'Grille horaire' },
  { value: 'topLine', label: 'Ligne du haut (journée entière)' }
]

/**
 * Identifiants stables des types créés par migration. Ils permettent de
 * rattacher les anciens éléments sans dépendre de l'ordre de création.
 */
export const DEFAULT_ITEM_TYPE_IDS = {
  task: '00000000-0000-4000-8000-000000000001',
  fixed: '00000000-0000-4000-8000-000000000002',
  exam: '00000000-0000-4000-8000-000000000003',
  free: '00000000-0000-4000-8000-000000000004',
  event: '00000000-0000-4000-8000-000000000005'
} as const

export type DefaultItemTypeKey = keyof typeof DEFAULT_ITEM_TYPE_IDS

export interface DefaultItemTypeDefinition {
  readonly key: DefaultItemTypeKey
  readonly name: string
  readonly style: ItemTypeStyle
  readonly color: string | null
  readonly isTask: boolean
  readonly countdown: boolean
  readonly placement: ItemTypePlacement
}

/**
 * Les cinq types créés au premier lancement. Ils reproduisent le comportement
 * des types historiques, plus « Événement » (journée entière, couleur propre).
 */
export const DEFAULT_ITEM_TYPES: readonly DefaultItemTypeDefinition[] = [
  {
    key: 'task',
    name: 'Tâche',
    style: 'category',
    color: null,
    isTask: true,
    countdown: false,
    placement: 'grid'
  },
  {
    key: 'fixed',
    name: 'Fixe',
    style: 'neutral',
    color: null,
    isTask: false,
    countdown: false,
    placement: 'grid'
  },
  {
    key: 'exam',
    name: 'Épreuve',
    style: 'alert',
    color: null,
    isTask: false,
    countdown: true,
    placement: 'topLine'
  },
  {
    key: 'free',
    name: 'Libre',
    style: 'free',
    color: null,
    isTask: false,
    countdown: false,
    placement: 'grid'
  },
  {
    key: 'event',
    name: 'Événement',
    style: 'neutral',
    color: '#6E56CF',
    isTask: false,
    countdown: false,
    placement: 'topLine'
  }
]

export const ITEM_TYPE_NAMES_MAX_LENGTH = 80

/** Couleur proposée lorsqu'un type choisit une couleur propre. */
export const DEFAULT_ITEM_TYPE_COLOR = '#3E63DD'

const LEGACY_ITEM_KIND_TO_TYPE_KEY: Readonly<Record<string, DefaultItemTypeKey>> = {
  fixed: 'fixed',
  task: 'task',
  exam: 'exam',
  free: 'free'
}

/** Rattaché à un ancien `kind`, ou au type Fixe si la valeur est inconnue. */
export function defaultItemTypeIdForKind(kind: string): string {
  const key = LEGACY_ITEM_KIND_TO_TYPE_KEY[kind] ?? 'fixed'
  return DEFAULT_ITEM_TYPE_IDS[key]
}

/** Ancien type de modèle (`fixed`/`free`) vers son type d'élément. */
export function defaultTemplateTypeIdForKind(kind: string): string {
  return kind === 'free' ? DEFAULT_ITEM_TYPE_IDS.free : DEFAULT_ITEM_TYPE_IDS.fixed
}

/** Construit les cinq types de départ avec des horodatages donnés. */
export function createDefaultItemTypes(
  timestamp: IsoDateTime = new Date().toISOString()
): ItemType[] {
  return DEFAULT_ITEM_TYPES.map((definition, order) => ({
    id: DEFAULT_ITEM_TYPE_IDS[definition.key],
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name: definition.name,
    order,
    archivedAt: null,
    style: definition.style,
    color: definition.color,
    isTask: definition.isTask,
    countdown: definition.countdown,
    placement: definition.placement
  }))
}

export function isItemTypeStyle(value: unknown): value is ItemTypeStyle {
  return ITEM_TYPE_STYLES.some((option) => option.value === value)
}

export function isItemTypePlacement(value: unknown): value is ItemTypePlacement {
  return ITEM_TYPE_PLACEMENTS.some((option) => option.value === value)
}

/** Types actifs, triés par ordre d'affichage. */
export function sortActiveItemTypes(types: readonly ItemType[]): ItemType[] {
  return types
    .filter((type) => type.deletedAt === null && type.archivedAt === null)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr'))
}

/** Premier type actif marqué « tâche », ou `null` s'il n'en existe aucun. */
export function firstTaskType(types: readonly ItemType[]): ItemType | null {
  return sortActiveItemTypes(types).find((type) => type.isTask) ?? null
}

/** Premier type actif qui n'est pas une tâche, ou `null`. */
export function firstNonTaskType(types: readonly ItemType[]): ItemType | null {
  return sortActiveItemTypes(types).find((type) => !type.isTask) ?? null
}

/**
 * Premier type actif placé sur la ligne du haut. Les types non-tâches sont
 * privilégiés pour une création rapide, mais un type tâche reste utilisable.
 */
export function firstTopLineType(types: readonly ItemType[]): ItemType | null {
  const active = sortActiveItemTypes(types)

  return (
    active.find((type) => type.placement === 'topLine' && !type.isTask) ??
    active.find((type) => type.placement === 'topLine') ??
    null
  )
}

/**
 * Type de secours lorsqu'un élément référence un type supprimé ou absent d'une
 * sauvegarde ancienne. Il reste affichable sans jamais bloquer la grille.
 */
export function fallbackItemType(typeId: string): ItemType {
  return {
    id: typeId,
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
    deletedAt: null,
    name: 'Type inconnu',
    order: Number.MAX_SAFE_INTEGER,
    archivedAt: null,
    style: 'neutral',
    color: null,
    isTask: false,
    countdown: false,
    placement: 'grid'
  }
}

/** Couleur d'accent d'une entrée, selon le style de son type. */
export function itemTypeAccentColor(type: ItemType, categoryColor: string | null): string | null {
  if (type.style === 'category') return categoryColor
  if (type.style === 'alert') return null
  return type.color
}

export interface ItemTypeDetailsInput {
  name: string
  style: ItemTypeStyle
  color: string | null
  isTask: boolean
  countdown: boolean
  placement: ItemTypePlacement
}

function validateBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RangeError(`${label} doit être vrai ou faux.`)
  }

  return value
}

/**
 * Vérifie et normalise les propriétés d'un type. La couleur propre n'est
 * conservée que pour les styles qui n'empruntent pas déjà une couleur
 * (neutre ou libre) : alerte et catégorie imposent leur propre rendu.
 */
export function normalizeItemTypeDetails(input: ItemTypeDetailsInput): ItemTypeDetailsInput {
  const name = normalizeCategoryName(input.name)

  if (name.length === 0) {
    throw new RangeError('Donnez un nom au type.')
  }

  if (name.length > ITEM_TYPE_NAMES_MAX_LENGTH) {
    throw new RangeError(
      `Le nom du type ne doit pas dépasser ${ITEM_TYPE_NAMES_MAX_LENGTH} caractères.`
    )
  }

  if (!isItemTypeStyle(input.style)) {
    throw new RangeError('Le style du type est invalide.')
  }

  if (!isItemTypePlacement(input.placement)) {
    throw new RangeError('Le placement du type est invalide.')
  }

  let color: string | null = null

  if (input.style === 'neutral' || input.style === 'free') {
    if (input.color !== null && input.color.trim().length > 0) {
      color = normalizeCategoryColor(input.color)

      if (color === null) {
        throw new RangeError('La couleur propre du type est invalide.')
      }
    }
  }

  return {
    name,
    style: input.style,
    color,
    isTask: validateBoolean(input.isTask, 'Le réglage « tâche »'),
    countdown: validateBoolean(input.countdown, 'Le compte à rebours'),
    placement: input.placement
  }
}
