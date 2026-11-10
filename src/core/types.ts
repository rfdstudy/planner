/**
 * Modèle de données de Planner v2.
 *
 * Les horaires ne portent aucun fuseau : une date locale (`YYYY-MM-DD`) et des
 * minutes depuis minuit suffisent. Les horodatages de traçabilité sont en ISO
 * 8601 pour rester lisibles dans les sauvegardes JSON.
 */

/** Date locale au format `YYYY-MM-DD`. */
export type LocalDate = string

/** Horodatage ISO 8601, par exemple `2026-11-12T18:30:00.000Z`. */
export type IsoDateTime = string

/** Champs communs à tous les enregistrements. */
export interface BaseRecord {
  id: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  /** Renseigné uniquement après une suppression logique. */
  deletedAt: IsoDateTime | null
}

/** Valeur sérialisable dans les sauvegardes JSON. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface CategoryGroup extends BaseRecord {
  name: string
  order: number
}

export interface Category extends BaseRecord {
  name: string
  /** Couleur libre, par exemple une valeur hexadécimale. */
  color: string
  groupId: string | null
  order: number
  /** Une catégorie archivée reste lisible mais n'est plus proposée. */
  archivedAt: IsoDateTime | null
}

export type ItemKind = 'fixed' | 'task' | 'exam' | 'free'

export type ItemStatus = 'todo' | 'done'

export interface Item extends BaseRecord {
  kind: ItemKind
  title: string
  notes: string
  /** `null` signifie « sans catégorie » (neutre). */
  categoryId: string | null
  /** Durée totale estimée, à répartir en un ou plusieurs blocs. */
  estimateMin: number | null
  /** Utile pour les tâches ; `null` pour les autres types d'éléments. */
  status: ItemStatus | null
  /** Renseigné si l'élément provient d'un modèle de semaine type. */
  templateId: string | null
}

export interface Block extends BaseRecord {
  itemId: string
  date: LocalDate
  /** `null` est autorisé pour une épreuve sans heure de début. */
  startMin: number | null
  durationMin: number
}

export type TemplateKind = 'fixed' | 'free'

export interface Template extends BaseRecord {
  kind: TemplateKind
  title: string
  categoryId: string | null
  /** Règle de récurrence au format RRULE, par exemple `FREQ=WEEKLY;BYDAY=MO,WE`. */
  rrule: string
  startMin: number
  durationMin: number
  validFrom: LocalDate
  validUntil: LocalDate | null
}

export type OverrideAction = 'skip' | 'modify'

export interface Override extends BaseRecord {
  templateId: string
  date: LocalDate
  action: OverrideAction
  /** Champs remplacés lorsque `action` vaut `modify` ; `null` sinon. */
  title: string | null
  categoryId: string | null
  startMin: number | null
  durationMin: number | null
}

export interface Setting extends BaseRecord {
  key: string
  value: JsonValue
}
