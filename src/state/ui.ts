import { create } from 'zustand'
import { addDays, getWeekStart, todayLocalDate } from '../core/time'
import type { LocalDate } from '../core/types'

export type AppScreen = 'week' | 'categories'

interface UiState {
  screen: AppScreen
  /** Lundi de la semaine affichée. */
  weekStart: LocalDate
  previousWeek: () => void
  nextWeek: () => void
  goToToday: () => void
  showWeek: (weekStart?: LocalDate) => void
  openCategories: () => void
}

/**
 * État d'interface partagé : écran courant et semaine affichée. Les données
 * restent dans les repositories ; ce store ne contient que de la navigation.
 */
export const useUiStore = create<UiState>((set) => ({
  screen: 'week',
  weekStart: getWeekStart(todayLocalDate()),
  previousWeek: () => set((state) => ({ weekStart: addDays(state.weekStart, -7) })),
  nextWeek: () => set((state) => ({ weekStart: addDays(state.weekStart, 7) })),
  goToToday: () => set({ weekStart: getWeekStart(todayLocalDate()) }),
  showWeek: (weekStart) =>
    set((state) => ({
      screen: 'week',
      weekStart: weekStart === undefined ? state.weekStart : getWeekStart(weekStart)
    })),
  openCategories: () => set({ screen: 'categories' })
}))
