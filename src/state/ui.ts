import { create } from 'zustand'
import { addDays, getWeekStart, todayLocalDate } from '../core/time'
import type { LocalDate } from '../core/types'

export type AppScreen = 'week' | 'categories' | 'templates'

/** Échelle de temps affichée : une journée seule ou la semaine entière. */
export type CalendarViewMode = 'day' | 'week'

/** Type du bloc créé par la palette ou le raccourci clavier. */
export type CreationKind = 'task' | 'fixed'

export interface CreationRequest {
  id: number
  kind: CreationKind
}

interface UiState {
  screen: AppScreen
  /** Lundi de la semaine affichée. */
  weekStart: LocalDate
  /** Jour affiché en vue Jour. */
  selectedDate: LocalDate
  viewMode: CalendarViewMode
  paletteOpen: boolean
  /** Demande d'ouverture de l'éditeur, traitée par la vue calendrier. */
  creationRequest: CreationRequest | null
  creationSequence: number
  previousPeriod: () => void
  nextPeriod: () => void
  goToToday: () => void
  /** Revient au calendrier, éventuellement sur une date précise. */
  showCalendar: (date?: LocalDate) => void
  /** Affiche la date demandée dans la vue courante. */
  goToDate: (date: LocalDate) => void
  setView: (viewMode: CalendarViewMode) => void
  openCategories: () => void
  openTemplates: () => void
  openPalette: () => void
  closePalette: () => void
  togglePalette: () => void
  requestCreation: (kind: CreationKind) => void
  consumeCreation: (id: number) => void
}

/**
 * État d'interface partagé : écran courant, date affichée et palette de
 * commandes. Les données restent dans les repositories ; ce store ne contient
 * que de la navigation.
 */
export const useUiStore = create<UiState>((set) => ({
  screen: 'week',
  weekStart: getWeekStart(todayLocalDate()),
  selectedDate: todayLocalDate(),
  viewMode: 'week',
  paletteOpen: false,
  creationRequest: null,
  creationSequence: 0,
  previousPeriod: () =>
    set((state) => {
      if (state.viewMode === 'week') {
        return { weekStart: addDays(state.weekStart, -7) }
      }

      const selectedDate = addDays(state.selectedDate, -1)
      return { selectedDate, weekStart: getWeekStart(selectedDate) }
    }),
  nextPeriod: () =>
    set((state) => {
      if (state.viewMode === 'week') {
        return { weekStart: addDays(state.weekStart, 7) }
      }

      const selectedDate = addDays(state.selectedDate, 1)
      return { selectedDate, weekStart: getWeekStart(selectedDate) }
    }),
  goToToday: () =>
    set({
      weekStart: getWeekStart(todayLocalDate()),
      selectedDate: todayLocalDate()
    }),
  showCalendar: (date) => {
    if (date === undefined) {
      set({ screen: 'week' })
      return
    }

    set({
      screen: 'week',
      weekStart: getWeekStart(date),
      selectedDate: date
    })
  },
  goToDate: (date) =>
    set({
      screen: 'week',
      weekStart: getWeekStart(date),
      selectedDate: date
    }),
  setView: (viewMode) =>
    set((state) => {
      if (viewMode === state.viewMode) return {}

      if (viewMode === 'week') {
        return { viewMode, weekStart: getWeekStart(state.selectedDate) }
      }

      const today = todayLocalDate()
      const selectedInWeek = getWeekStart(state.selectedDate) === state.weekStart
      const selectedDate = selectedInWeek
        ? state.selectedDate
        : getWeekStart(today) === state.weekStart
          ? today
          : state.weekStart

      return { viewMode, selectedDate }
    }),
  openCategories: () => set({ screen: 'categories', paletteOpen: false }),
  openTemplates: () => set({ screen: 'templates', paletteOpen: false }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),
  requestCreation: (kind) =>
    set((state) => ({
      screen: 'week',
      creationSequence: state.creationSequence + 1,
      creationRequest: { id: state.creationSequence + 1, kind }
    })),
  consumeCreation: (id) =>
    set((state) => (state.creationRequest?.id === id ? { creationRequest: null } : {}))
}))
