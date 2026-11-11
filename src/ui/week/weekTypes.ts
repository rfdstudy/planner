import type { BlockPlacement } from '../../core/schedule'
import type { Block, Category, Item, LocalDate } from '../../core/types'

/** Bloc accompagné de son élément et de sa catégorie éventuelle. */
export interface WeekEntry {
  block: Block
  item: Item
  category: Category | null
}

/** Bloc horaire avec sa position calculée dans la colonne du jour. */
export interface PlacedEntry extends WeekEntry {
  placement: BlockPlacement<Block>
}

export interface WeekDayData {
  date: LocalDate
  timed: PlacedEntry[]
  exams: WeekEntry[]
}

export interface WeekData {
  weekStart: LocalDate
  days: WeekDayData[]
}
