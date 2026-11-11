import { beforeEach, describe, expect, it } from 'vitest'
import { getWeekStart, todayLocalDate } from '../src/core/time'
import { useUiStore } from '../src/state/ui'

beforeEach(() => {
  useUiStore.setState({
    screen: 'week',
    viewMode: 'week',
    weekStart: '2026-11-09',
    weekStartsOn: 0,
    selectedDate: '2026-11-12',
    paletteOpen: false,
    creationRequest: null,
    creationSequence: 0
  })
})

describe('navigation du calendrier', () => {
  it('bascule en vue Jour sur le jour déjà sélectionné', () => {
    useUiStore.getState().setView('day')

    expect(useUiStore.getState().viewMode).toBe('day')
    expect(useUiStore.getState().selectedDate).toBe('2026-11-12')
  })

  it('choisit le lundi de la semaine affichée si le jour sélectionné est ailleurs', () => {
    useUiStore.setState({ weekStart: '2026-11-16' })
    useUiStore.getState().setView('day')

    expect(useUiStore.getState().selectedDate).toBe('2026-11-16')
  })

  it('avance d’un jour à l’autre en vue Jour et synchronise la semaine', () => {
    useUiStore.setState({
      viewMode: 'day',
      weekStart: '2026-11-09',
      selectedDate: '2026-11-15'
    })

    useUiStore.getState().nextPeriod()

    expect(useUiStore.getState().selectedDate).toBe('2026-11-16')
    expect(useUiStore.getState().weekStart).toBe('2026-11-16')
  })

  it('avance d’une semaine en vue Semaine', () => {
    useUiStore.getState().nextPeriod()

    expect(useUiStore.getState().weekStart).toBe('2026-11-16')
    expect(useUiStore.getState().selectedDate).toBe('2026-11-12')
  })

  it('ne revient pas à la semaine du jour sélectionné quand la vue ne change pas', () => {
    useUiStore.setState({ weekStart: '2026-11-23' })
    useUiStore.getState().setView('week')

    expect(useUiStore.getState().weekStart).toBe('2026-11-23')
  })

  it('revient à aujourd’hui dans les deux vues', () => {
    useUiStore.setState({
      viewMode: 'day',
      weekStart: '2020-01-06',
      selectedDate: '2020-01-08'
    })

    useUiStore.getState().goToToday()

    const state = useUiStore.getState()
    expect(state.selectedDate).toBe(todayLocalDate())
    expect(state.weekStart).toBe(getWeekStart(todayLocalDate()))
  })

  it('recalcule la semaine affichée quand le premier jour change', () => {
    useUiStore.setState({
      screen: 'settings',
      viewMode: 'week',
      weekStart: '2026-11-09',
      selectedDate: '2026-11-12'
    })

    useUiStore.getState().setWeekStartsOn(6)

    expect(useUiStore.getState().weekStartsOn).toBe(6)
    expect(useUiStore.getState().weekStart).toBe('2026-11-08')
  })

  it('suit le premier jour choisi pour les semaines suivantes', () => {
    useUiStore.setState({
      weekStartsOn: 6,
      weekStart: '2026-11-08',
      selectedDate: '2026-11-12'
    })

    useUiStore.getState().nextPeriod()

    expect(useUiStore.getState().weekStart).toBe('2026-11-15')
  })
})

describe('commandes de navigation', () => {
  it('affiche la semaine contenant la date demandée', () => {
    useUiStore.setState({ viewMode: 'week' })
    useUiStore.getState().goToDate('2026-12-02')

    expect(useUiStore.getState().weekStart).toBe('2026-11-30')
    expect(useUiStore.getState().selectedDate).toBe('2026-12-02')
    expect(useUiStore.getState().screen).toBe('week')
  })

  it('transmet une demande de création à la vue calendrier', () => {
    useUiStore.setState({ screen: 'categories' })
    useUiStore.getState().requestCreation('fixed')

    const request = useUiStore.getState().creationRequest
    expect(useUiStore.getState().screen).toBe('week')
    expect(request?.kind).toBe('fixed')

    if (request !== null) {
      useUiStore.getState().consumeCreation(request.id)
    }

    expect(useUiStore.getState().creationRequest).toBeNull()
  })
})
