import type { BlockPlacement } from '../../core/schedule'
import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  ItemType,
  LocalDate,
  Template
} from '../../core/types'

/** Point d'ancrage de la fenêtre flottante, en coordonnées du viewport. */
export interface FloatingAnchor {
  x: number
  y: number
}

/** Bloc accompagné de son élément, de son type et de sa catégorie éventuelle. */
export interface ScheduleEntry {
  block: Block
  item: Item
  type: ItemType
  category: Category | null
  /** Modèle d'origine lorsque le bloc est une occurrence virtuelle. */
  template: Template | null
}

/** Bloc horaire avec sa position calculée dans la colonne du jour. */
export interface PlacedEntry extends ScheduleEntry {
  placement: BlockPlacement<Block>
}

export interface ScheduleDayData {
  date: LocalDate
  timed: PlacedEntry[]
  /** Éléments sans heure, affichés sur la ligne du haut. */
  topLine: ScheduleEntry[]
}

export interface ScheduleData {
  rangeStart: LocalDate
  rangeEnd: LocalDate
  days: ScheduleDayData[]
  itemTypes: ItemType[]
  categories: Category[]
  categoryGroups: CategoryGroup[]
}
