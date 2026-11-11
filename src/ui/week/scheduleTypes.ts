import type { BlockPlacement } from '../../core/schedule'
import type { Block, Category, CategoryGroup, Item, LocalDate, Template } from '../../core/types'

/** Point d'ancrage de la fenêtre flottante, en coordonnées du viewport. */
export interface FloatingAnchor {
  x: number
  y: number
}

/** Bloc accompagné de son élément et de sa catégorie éventuelle. */
export interface ScheduleEntry {
  block: Block
  item: Item
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
  exams: ScheduleEntry[]
}

export interface ScheduleData {
  rangeStart: LocalDate
  rangeEnd: LocalDate
  days: ScheduleDayData[]
  categories: Category[]
  categoryGroups: CategoryGroup[]
}
