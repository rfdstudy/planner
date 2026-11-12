import { describe, expect, it } from 'vitest'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import {
  PHONE_SNAPSHOT_VERSION,
  createPhoneSnapshot,
  formatPhoneSnapshotPeriod
} from '../src/core/phoneSnapshot'
import type {
  Block,
  Category,
  Item,
  ItemType,
  LocalDate,
  Override,
  Template
} from '../src/core/types'
import type { PhoneSnapshotDay } from '../src/core/phoneSnapshot'

const TIMESTAMP = '2026-11-01T10:00:00.000Z'
const TODAY: LocalDate = '2026-11-12'

function makeType(overrides: Partial<ItemType> = {}): ItemType {
  return {
    id: DEFAULT_ITEM_TYPE_IDS.fixed,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    name: 'Fixe',
    order: 0,
    archivedAt: null,
    style: 'neutral',
    color: null,
    isTask: false,
    countdown: false,
    placement: 'grid',
    ...overrides
  }
}

const TASK_TYPE = makeType({
  id: DEFAULT_ITEM_TYPE_IDS.task,
  name: 'Tâche',
  style: 'category',
  isTask: true
})

const FIXED_TYPE = makeType()

const EXAM_TYPE = makeType({
  id: DEFAULT_ITEM_TYPE_IDS.exam,
  name: 'Épreuve',
  style: 'alert',
  countdown: true,
  placement: 'topLine'
})

const EVENT_TYPE = makeType({
  id: DEFAULT_ITEM_TYPE_IDS.event,
  name: 'Événement',
  color: '#6E56CF',
  placement: 'topLine'
})

const CUSTOM_TYPE = makeType({
  id: 'type-custom',
  name: 'Sport',
  color: '#12A594'
})

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'category-maths',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    name: 'Maths',
    color: '#3E63DD',
    groupId: null,
    order: 0,
    archivedAt: null,
    ...overrides
  }
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    typeId: FIXED_TYPE.id,
    title: 'Élément',
    notes: '',
    categoryId: null,
    estimateMin: null,
    status: null,
    templateId: null,
    ...overrides
  }
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    itemId: 'item-1',
    date: TODAY,
    startMin: 10 * 60,
    durationMin: 60,
    endDate: null,
    ...overrides
  }
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'template-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    typeId: FIXED_TYPE.id,
    title: 'Cours',
    categoryId: null,
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
    startMin: 8 * 60,
    durationMin: 120,
    validFrom: '2026-10-01',
    validUntil: null,
    ...overrides
  }
}

function makeOverride(overrides: Partial<Override> = {}): Override {
  return {
    id: 'override-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    templateId: 'template-1',
    date: '2026-11-19',
    action: 'skip',
    typeId: null,
    title: null,
    categoryId: null,
    startMin: null,
    durationMin: null,
    ...overrides
  }
}

function snapshotWith(
  input: Partial<Parameters<typeof createPhoneSnapshot>[0]> = {}
): ReturnType<typeof createPhoneSnapshot> {
  return createPhoneSnapshot({
    today: TODAY,
    generatedAt: '2026-11-12T20:15:00.000Z',
    categories: [],
    itemTypes: [TASK_TYPE, FIXED_TYPE, EXAM_TYPE, EVENT_TYPE, CUSTOM_TYPE],
    items: [],
    blocks: [],
    templates: [],
    overrides: [],
    ...input
  })
}

function day(snapshot: ReturnType<typeof createPhoneSnapshot>, date: LocalDate): PhoneSnapshotDay {
  const found = snapshot.days.find((entry) => entry.date === date)

  if (found === undefined) throw new Error(`Jour absent de l’instantané : ${date}`)
  return found
}

describe('instantané pour le téléphone', () => {
  it('décrit la fenêtre de la veille à trois semaines et sa version', () => {
    const snapshot = snapshotWith()

    expect(snapshot.snapshotVersion).toBe(PHONE_SNAPSHOT_VERSION)
    expect(snapshot.rangeStart).toBe('2026-11-11')
    expect(snapshot.rangeEnd).toBe('2026-12-03')
    expect(snapshot.days).toHaveLength(23)
    expect(snapshot.days[0]?.date).toBe('2026-11-11')
    expect(snapshot.days.at(-1)?.date).toBe('2026-12-03')
  })

  it('développe la semaine type et applique ses exceptions', () => {
    const snapshot = snapshotWith({
      templates: [makeTemplate()],
      overrides: [
        makeOverride({ date: '2026-11-19', action: 'skip' }),
        makeOverride({
          date: '2026-11-26',
          action: 'modify',
          typeId: FIXED_TYPE.id,
          title: 'Cours décalé',
          categoryId: null,
          startMin: 10 * 60,
          durationMin: 90
        })
      ]
    })

    expect(day(snapshot, '2026-11-12').blocks).toMatchObject([
      { title: 'Cours', startMin: 480, endMin: 600 }
    ])
    expect(day(snapshot, '2026-11-19').blocks).toEqual([])
    expect(day(snapshot, '2026-11-26').blocks).toMatchObject([
      { title: 'Cours décalé', startMin: 600, endMin: 690 }
    ])

    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('template-1')
    expect(serialized).not.toContain('override-1')
  })

  it('répète un élément multi-jours sur chaque jour de sa période', () => {
    const snapshot = snapshotWith({
      items: [makeItem({ title: 'Vacances', typeId: EVENT_TYPE.id })],
      blocks: [
        makeBlock({
          date: '2026-11-11',
          startMin: null,
          durationMin: 1440,
          endDate: '2026-11-13'
        })
      ]
    })

    for (const date of ['2026-11-11', '2026-11-12', '2026-11-13']) {
      expect(day(snapshot, date).allDay).toMatchObject([
        {
          title: 'Vacances',
          typeName: 'Événement',
          typeStyle: 'neutral',
          color: '#6E56CF',
          period: 'du 11 au 13 nov.'
        }
      ])
    }

    expect(day(snapshot, '2026-11-14').allDay).toEqual([])
    expect(formatPhoneSnapshotPeriod('2026-10-30', '2026-11-02')).toBe('du 30 oct. au 2 nov.')
    expect(formatPhoneSnapshotPeriod('2026-12-30', '2027-01-02')).toBe(
      'du 30 déc. 2026 au 2 janv. 2027'
    )
  })

  it('exporte une tâche terminée avec ses notes et sa catégorie', () => {
    const snapshot = snapshotWith({
      categories: [makeCategory()],
      items: [
        makeItem({
          title: 'Réviser les suites',
          typeId: TASK_TYPE.id,
          categoryId: 'category-maths',
          status: 'done',
          notes: '- [x] Fiche\n- [ ] Exercices'
        })
      ],
      blocks: [makeBlock({ startMin: 14 * 60, durationMin: 90 })]
    })

    expect(day(snapshot, TODAY).blocks).toEqual([
      {
        title: 'Réviser les suites',
        startMin: 840,
        endMin: 930,
        typeName: 'Tâche',
        typeStyle: 'category',
        color: '#3E63DD',
        categoryName: 'Maths',
        done: true,
        notes: '- [x] Fiche\n- [ ] Exercices'
      }
    ])
  })

  it('gère un type sans catégorie et ignore une tâche encore à planifier', () => {
    const snapshot = snapshotWith({
      items: [
        makeItem({ title: 'Course', typeId: CUSTOM_TYPE.id, categoryId: null }),
        makeItem({ id: 'item-sans-bloc', title: 'À planifier', typeId: TASK_TYPE.id })
      ],
      blocks: [makeBlock({ itemId: 'item-1', startMin: 18 * 60, durationMin: 45 })]
    })

    expect(day(snapshot, TODAY).blocks).toMatchObject([
      {
        title: 'Course',
        typeStyle: 'neutral',
        color: '#12A594',
        categoryName: null
      }
    ])
    expect(JSON.stringify(snapshot)).not.toContain('À planifier')
    expect(JSON.stringify(snapshot)).not.toContain('item-sans-bloc')
  })

  it('ignore les éléments et les blocs supprimés', () => {
    const snapshot = snapshotWith({
      items: [
        makeItem({ title: 'Élément supprimé', deletedAt: TIMESTAMP }),
        makeItem({ id: 'item-actif', title: 'Bloc supprimé', typeId: FIXED_TYPE.id })
      ],
      blocks: [
        makeBlock({ id: 'block-1', itemId: 'item-1' }),
        makeBlock({
          id: 'block-2',
          itemId: 'item-actif',
          deletedAt: TIMESTAMP,
          startMin: 11 * 60
        })
      ]
    })

    expect(day(snapshot, TODAY).blocks).toEqual([])
  })
})
