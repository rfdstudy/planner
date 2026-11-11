import { describe, expect, it } from 'vitest'
import {
  getBlockContentMode,
  getFreeSlots,
  layoutBlocks,
  showsBlockCategory,
  type SchedulableBlock
} from '../src/core/schedule'

function block(id: string, startMin: number | null, durationMin: number): SchedulableBlock {
  return { id, startMin, durationMin }
}

describe('placement côte à côte des blocs', () => {
  it('laisse toute la largeur aux blocs qui ne se chevauchent pas', () => {
    const placements = layoutBlocks([block('a', 540, 60), block('b', 660, 60)])

    expect(placements).toEqual([
      {
        block: block('a', 540, 60),
        startMin: 540,
        endMin: 600,
        column: 0,
        columnCount: 1,
        leftRatio: 0,
        widthRatio: 1
      },
      {
        block: block('b', 660, 60),
        startMin: 660,
        endMin: 720,
        column: 0,
        columnCount: 1,
        leftRatio: 0,
        widthRatio: 1
      }
    ])
  })

  it('met deux blocs qui se chevauchent sur deux colonnes', () => {
    const placements = layoutBlocks([block('a', 540, 60), block('b', 570, 60)])

    expect(
      placements.map(({ block: placed, column, columnCount, leftRatio, widthRatio }) => ({
        id: placed.id,
        column,
        columnCount,
        leftRatio,
        widthRatio
      }))
    ).toEqual([
      { id: 'a', column: 0, columnCount: 2, leftRatio: 0, widthRatio: 0.5 },
      { id: 'b', column: 1, columnCount: 2, leftRatio: 0.5, widthRatio: 0.5 }
    ])
  })

  it('ne considère pas deux blocs qui se touchent comme chevauchants', () => {
    const placements = layoutBlocks([block('a', 540, 60), block('b', 600, 60)])

    expect(placements.every((placement) => placement.columnCount === 1)).toBe(true)
  })

  it('réutilise une colonne libérée dans un même groupe', () => {
    const placements = layoutBlocks([
      block('matin', 540, 180),
      block('court', 570, 30),
      block('suivant', 615, 45)
    ])

    expect(
      placements.map(({ block: placed, column, columnCount }) => ({
        id: placed.id,
        column,
        columnCount
      }))
    ).toEqual([
      { id: 'matin', column: 0, columnCount: 2 },
      { id: 'court', column: 1, columnCount: 2 },
      { id: 'suivant', column: 1, columnCount: 2 }
    ])
  })

  it('sépare les groupes de chevauchement indépendants', () => {
    const placements = layoutBlocks([block('a', 540, 60), block('b', 570, 60), block('c', 720, 60)])

    expect(
      placements.map(({ block: placed, column, columnCount }) => ({
        id: placed.id,
        column,
        columnCount
      }))
    ).toEqual([
      { id: 'a', column: 0, columnCount: 2 },
      { id: 'b', column: 1, columnCount: 2 },
      { id: 'c', column: 0, columnCount: 1 }
    ])
  })

  it('ignore les blocs sans heure de début et les durées non positives', () => {
    const placements = layoutBlocks([
      block('epreuve', null, 60),
      block('vide', 600, 0),
      block('normal', 660, 60)
    ])

    expect(placements).toHaveLength(1)
    expect(placements[0]?.block.id).toBe('normal')
  })
})

describe('contenu des blocs selon leur hauteur', () => {
  it('masque l’heure sous 30 minutes', () => {
    expect(getBlockContentMode(15)).toBe('title')
    expect(getBlockContentMode(29)).toBe('title')
  })

  it('affiche seulement l’heure de début de 30 à 59 minutes', () => {
    expect(getBlockContentMode(30)).toBe('title-and-start')
    expect(getBlockContentMode(59)).toBe('title-and-start')
  })

  it('affiche la plage horaire dès 60 minutes', () => {
    expect(getBlockContentMode(60)).toBe('title-and-range')
    expect(getBlockContentMode(120)).toBe('title-and-range')
  })

  it('ajoute la catégorie seulement au-delà de 90 minutes', () => {
    expect(showsBlockCategory(90)).toBe(false)
    expect(showsBlockCategory(91)).toBe(true)
  })
})

describe('créneaux libres d’une journée', () => {
  it('renvoie la journée entière quand aucun bloc n’est placé', () => {
    expect(getFreeSlots([])).toEqual([{ startMin: 0, endMin: 1440, durationMin: 1440 }])
  })

  it('renvoie les intervalles entre les blocs', () => {
    expect(getFreeSlots([block('a', 540, 60), block('b', 630, 90)])).toEqual([
      { startMin: 0, endMin: 540, durationMin: 540 },
      { startMin: 600, endMin: 630, durationMin: 30 },
      { startMin: 720, endMin: 1440, durationMin: 720 }
    ])
  })

  it('fusionne les blocs qui se chevauchent', () => {
    expect(getFreeSlots([block('a', 540, 90), block('b', 600, 60)])).toEqual([
      { startMin: 0, endMin: 540, durationMin: 540 },
      { startMin: 660, endMin: 1440, durationMin: 780 }
    ])
  })

  it('découpe les blocs qui dépassent de la journée', () => {
    expect(getFreeSlots([block('avant', -30, 60), block('apres', 1430, 60)])).toEqual([
      { startMin: 30, endMin: 1430, durationMin: 1400 }
    ])
  })

  it('ne crée pas de faux créneau entre deux blocs qui se touchent', () => {
    expect(getFreeSlots([block('a', 540, 60), block('b', 600, 60)])).toEqual([
      { startMin: 0, endMin: 540, durationMin: 540 },
      { startMin: 660, endMin: 1440, durationMin: 780 }
    ])
  })

  it('filtre les créneaux plus courts que la durée minimale', () => {
    const slots = getFreeSlots([block('a', 540, 60), block('b', 610, 10)], {
      dayStartMin: 480,
      dayEndMin: 720,
      minimumDurationMin: 15
    })

    expect(slots).toEqual([
      { startMin: 480, endMin: 540, durationMin: 60 },
      { startMin: 620, endMin: 720, durationMin: 100 }
    ])
  })

  it('ignore un bloc sans heure de début', () => {
    expect(
      getFreeSlots([block('epreuve', null, 60)], { dayStartMin: 480, dayEndMin: 720 })
    ).toEqual([{ startMin: 480, endMin: 720, durationMin: 240 }])
  })

  it('renvoie une liste vide quand la journée est entièrement occupée', () => {
    expect(getFreeSlots([block('a', 0, 720), block('b', 720, 720)])).toEqual([])
  })

  it('refuse une plage horaire incohérente', () => {
    expect(() => getFreeSlots([], { dayStartMin: 600, dayEndMin: 480 })).toThrow(RangeError)
    expect(() => getFreeSlots([], { dayEndMin: 1500 })).toThrow(RangeError)
  })
})
