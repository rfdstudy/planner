import { describe, expect, it } from 'vitest'
import {
  MAX_TOP_LINE_ROWS,
  blockOccursOn,
  getBlockContentMode,
  getBlockEndDate,
  getFreeSlots,
  isMultiDayBlock,
  layoutBlocks,
  layoutTopLineBands,
  normalizeBlockEndDate,
  showsBlockCategory,
  type SchedulableBlock,
  type TopLineBand
} from '../src/core/schedule'

function block(id: string, startMin: number | null, durationMin: number): SchedulableBlock {
  return { id, startMin, durationMin }
}

function band(id: string, date: string, endDate: string | null = null): TopLineBand {
  return { id, date, endDate }
}

const WEEK = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
  '2026-11-15'
]

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

describe('périodes de plusieurs jours', () => {
  it('renvoie le dernier jour inclus, ou la date de début sans fin', () => {
    expect(getBlockEndDate({ date: '2026-11-12' })).toBe('2026-11-12')
    expect(getBlockEndDate({ date: '2026-11-12', endDate: null })).toBe('2026-11-12')
    expect(getBlockEndDate({ date: '2026-11-12', endDate: '2026-11-14' })).toBe('2026-11-14')
  })

  it('reconnaît un élément multi-jours et sa présence sur chaque jour', () => {
    const holidays = { date: '2026-11-10', endDate: '2026-11-12' }

    expect(isMultiDayBlock(holidays)).toBe(true)
    expect(isMultiDayBlock({ date: '2026-11-10' })).toBe(false)
    expect(blockOccursOn(holidays, '2026-11-09')).toBe(false)
    expect(blockOccursOn(holidays, '2026-11-10')).toBe(true)
    expect(blockOccursOn(holidays, '2026-11-12')).toBe(true)
    expect(blockOccursOn(holidays, '2026-11-13')).toBe(false)
  })

  it('normalise une fin absente ou égale au début', () => {
    expect(normalizeBlockEndDate('2026-11-12', undefined)).toBeNull()
    expect(normalizeBlockEndDate('2026-11-12', null)).toBeNull()
    expect(normalizeBlockEndDate('2026-11-12', '')).toBeNull()
    expect(normalizeBlockEndDate('2026-11-12', '2026-11-12')).toBeNull()
    expect(normalizeBlockEndDate('2026-11-12', '2026-11-14')).toBe('2026-11-14')
  })

  it('refuse une fin antérieure ou une date invalide', () => {
    expect(() => normalizeBlockEndDate('2026-11-12', '2026-11-10')).toThrow(RangeError)
    expect(() => normalizeBlockEndDate('2026-02-30', null)).toThrow(RangeError)
    expect(() => normalizeBlockEndDate('2026-11-12', '2026-02-30')).toThrow(RangeError)
  })

  it('ne bloque pas les créneaux libres puisqu’il n’a pas d’heure', () => {
    const holidays = {
      id: 'vacances',
      startMin: null,
      durationMin: 1440,
      date: '2026-11-10',
      endDate: '2026-11-14'
    }

    expect(getFreeSlots([holidays], { dayStartMin: 480, dayEndMin: 720 })).toEqual([
      { startMin: 480, endMin: 720, durationMin: 240 }
    ])
  })
})

describe('empilement des bandes de la ligne du haut', () => {
  it('place les bandes qui se chevauchent sur des lignes séparées', () => {
    const layout = layoutTopLineBands(
      [band('a', '2026-11-10', '2026-11-12'), band('b', '2026-11-11', '2026-11-13')],
      WEEK
    )

    expect(layout.rowCount).toBe(2)
    expect(layout.visibleRowCount).toBe(2)
    expect(layout.hiddenCount).toBe(0)
    expect(
      layout.bands.map(({ band: placed, row, startIndex, endIndex }) => ({
        id: placed.id,
        row,
        startIndex,
        endIndex
      }))
    ).toEqual([
      { id: 'a', row: 0, startIndex: 1, endIndex: 3 },
      { id: 'b', row: 1, startIndex: 2, endIndex: 4 }
    ])
  })

  it('fait partager une ligne aux bandes qui se touchent', () => {
    const layout = layoutTopLineBands(
      [
        band('a', '2026-11-10', '2026-11-12'),
        band('b', '2026-11-11', '2026-11-13'),
        band('c', '2026-11-13', '2026-11-13')
      ],
      WEEK
    )

    expect(layout.bands.map(({ band: placed, row }) => ({ id: placed.id, row }))).toEqual([
      { id: 'a', row: 0 },
      { id: 'b', row: 1 },
      { id: 'c', row: 0 }
    ])
  })

  it('plafonne l’affichage à trois lignes et compte les bandes masquées', () => {
    const layout = layoutTopLineBands(
      [
        band('a', '2026-11-10', '2026-11-12'),
        band('b', '2026-11-10', '2026-11-12'),
        band('c', '2026-11-10', '2026-11-12'),
        band('d', '2026-11-10', '2026-11-12')
      ],
      WEEK
    )

    expect(MAX_TOP_LINE_ROWS).toBe(3)
    expect(layout.rowCount).toBe(4)
    expect(layout.visibleRowCount).toBe(3)
    expect(layout.hiddenCount).toBe(1)
    expect(layout.bands.filter((placement) => placement.row >= MAX_TOP_LINE_ROWS)).toHaveLength(1)
  })
})

describe('troncature des bandes aux limites de la semaine', () => {
  it('marque et coupe une bande commencée avant la période', () => {
    const layout = layoutTopLineBands([band('a', '2026-11-06', '2026-11-10')], WEEK)
    const placement = layout.bands[0]

    expect(placement?.startIndex).toBe(0)
    expect(placement?.endIndex).toBe(1)
    expect(placement?.clippedStart).toBe(true)
    expect(placement?.clippedEnd).toBe(false)
  })

  it('marque et coupe une bande qui finit après la période', () => {
    const layout = layoutTopLineBands([band('a', '2026-11-13', '2026-11-20')], WEEK)
    const placement = layout.bands[0]

    expect(placement?.startIndex).toBe(4)
    expect(placement?.endIndex).toBe(6)
    expect(placement?.clippedStart).toBe(false)
    expect(placement?.clippedEnd).toBe(true)
  })

  it('tronque une bande qui couvre toute la période des deux côtés', () => {
    const layout = layoutTopLineBands([band('a', '2026-10-01', '2026-12-31')], WEEK)
    const placement = layout.bands[0]

    expect(placement?.startIndex).toBe(0)
    expect(placement?.endIndex).toBe(6)
    expect(placement?.clippedStart).toBe(true)
    expect(placement?.clippedEnd).toBe(true)
  })

  it('ignore une bande entièrement hors de la période affichée', () => {
    const layout = layoutTopLineBands(
      [band('avant', '2026-11-01', '2026-11-08'), band('apres', '2026-11-16', '2026-11-20')],
      WEEK
    )

    expect(layout.bands).toEqual([])
    expect(layout.rowCount).toBe(0)
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
