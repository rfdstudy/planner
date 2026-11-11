import { describe, expect, it } from 'vitest'
import {
  DRAG_START_DISTANCE_PX,
  clampBlockDuration,
  clampBlockStart,
  findColumnIndex,
  getGrabOffsetMin,
  getMoveStartMin,
  getResizeDurationMin,
  getTaskDragDuration,
  resolveDragPoint
} from '../src/core/drag'

describe('bornage et accrochage des blocs', () => {
  it('arrondit le début sur le pas de 15 minutes', () => {
    expect(clampBlockStart(847, 60)).toBe(840)
    expect(clampBlockStart(853, 60)).toBe(855)
  })

  it('empêche un bloc de dépasser minuit', () => {
    expect(clampBlockStart(1420, 60)).toBe(1380)
    expect(clampBlockStart(1439, 1440)).toBe(0)
  })

  it('borne les durées dans une journée', () => {
    expect(clampBlockDuration(0)).toBe(1)
    expect(clampBlockDuration(90)).toBe(90)
    expect(clampBlockDuration(2000)).toBe(1440)
  })

  it('conserve le point saisi sous le pointeur', () => {
    expect(getGrabOffsetMin(870, 840, 60)).toBe(30)
    expect(getGrabOffsetMin(840, 840, 60)).toBe(0)
    expect(getGrabOffsetMin(900, 840, 60)).toBe(59)
  })

  it('déplace le bloc sans saut au départ', () => {
    expect(getMoveStartMin(870, 30, 60)).toBe(840)
    expect(getMoveStartMin(900, 30, 60)).toBe(870)
    expect(getMoveStartMin(1430, 0, 60)).toBe(1380)
  })

  it('respecte un pas de glisser personnalisé', () => {
    expect(clampBlockStart(847, 60, 10)).toBe(850)
    expect(clampBlockStart(853, 60, 30)).toBe(840)
    expect(getMoveStartMin(902, 0, 60, 30)).toBe(900)
  })
})

describe('redimensionnement par le bas', () => {
  it('accroche la nouvelle durée sur 15 minutes', () => {
    expect(getResizeDurationMin(840, 932)).toBe(90)
    expect(getResizeDurationMin(840, 940)).toBe(105)
  })

  it('impose une durée minimale de 15 minutes', () => {
    expect(getResizeDurationMin(840, 800)).toBe(15)
    expect(getResizeDurationMin(840, 841)).toBe(15)
  })

  it('ne dépasse jamais minuit', () => {
    expect(getResizeDurationMin(1380, 1440)).toBe(60)
    expect(getResizeDurationMin(1430, 1440)).toBe(10)
  })

  it('suit le pas de glisser personnalisé', () => {
    expect(getResizeDurationMin(840, 932, 30)).toBe(90)
    expect(getResizeDurationMin(840, 950, 30)).toBe(120)
    expect(getResizeDurationMin(840, 845, 30)).toBe(30)
  })
})

describe('durée d’une tâche glissée', () => {
  it('utilise le temps restant quand il existe', () => {
    expect(getTaskDragDuration(45)).toBe(45)
    expect(getTaskDragDuration(90)).toBe(90)
  })

  it('retombe sur la durée par défaut sans temps restant', () => {
    expect(getTaskDragDuration(0)).toBe(60)
    expect(getTaskDragDuration(null)).toBe(60)
    expect(getTaskDragDuration(0, 30)).toBe(30)
  })

  it('borne la durée à une journée entière', () => {
    expect(getTaskDragDuration(5000)).toBe(1440)
  })
})

describe('point du pointeur dans la grille', () => {
  const columns = [
    { left: 100, right: 200 },
    { left: 200, right: 300 },
    { left: 300, right: 400 }
  ]

  it('trouve la colonne contenant l’abscisse', () => {
    expect(findColumnIndex(150, columns)).toBe(0)
    expect(findColumnIndex(250, columns)).toBe(1)
    expect(findColumnIndex(400, columns)).toBe(2)
    expect(findColumnIndex(99, columns)).toBeNull()
    expect(findColumnIndex(401, columns)).toBeNull()
  })

  it('repère le panneau À planifier avant la grille', () => {
    expect(
      resolveDragPoint(
        { x: 450, y: 500 },
        { gridTop: 100, pixelsPerMinute: 1, columns, inboxLeft: 420 }
      )
    ).toEqual({ zone: 'inbox' })
  })

  it('convertit la position verticale en minutes bornées', () => {
    expect(
      resolveDragPoint(
        { x: 250, y: 640 },
        { gridTop: 100, pixelsPerMinute: 1, columns, inboxLeft: null }
      )
    ).toEqual({ zone: 'grid', dayIndex: 1, minute: 540 })

    expect(
      resolveDragPoint(
        { x: 250, y: 2000 },
        { gridTop: 100, pixelsPerMinute: 1, columns, inboxLeft: null }
      )
    ).toEqual({ zone: 'grid', dayIndex: 1, minute: 1440 })
  })

  it('ignore les zones hors grille', () => {
    expect(
      resolveDragPoint(
        { x: 50, y: 500 },
        { gridTop: 100, pixelsPerMinute: 1, columns, inboxLeft: 420 }
      )
    ).toEqual({ zone: 'none' })
  })

  it('expose une distance de déclenchement positive', () => {
    expect(DRAG_START_DISTANCE_PX).toBeGreaterThan(0)
  })
})
