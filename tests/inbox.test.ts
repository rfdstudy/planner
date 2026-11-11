import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TASK_DURATION_MIN,
  getRemainingTaskMinutes,
  isTaskInInbox,
  listInboxTasks,
  sumPlannedMinutes,
  validateQuickTaskDraft
} from '../src/core/inbox'
import type { Block, Category, Item } from '../src/core/types'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    deletedAt: null,
    kind: 'task',
    title: 'DM Maths',
    notes: '',
    categoryId: 'category-1',
    estimateMin: 120,
    status: 'todo',
    templateId: null,
    ...overrides
  }
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    deletedAt: null,
    itemId: 'item-1',
    date: '2026-11-12',
    startMin: 840,
    durationMin: 60,
    ...overrides
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'category-1',
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    deletedAt: null,
    name: 'Maths',
    color: '#3E63DD',
    groupId: null,
    order: 0,
    archivedAt: null,
    ...overrides
  }
}

describe('temps restant d’une tâche', () => {
  it('additionne les durées des blocs', () => {
    expect(
      sumPlannedMinutes([makeBlock({ durationMin: 60 }), makeBlock({ durationMin: 30 })])
    ).toBe(90)
  })

  it('soustrait les blocs de la durée estimée', () => {
    expect(getRemainingTaskMinutes(makeItem({ estimateMin: 120 }), [])).toBe(120)
    expect(getRemainingTaskMinutes(makeItem({ estimateMin: 120 }), [makeBlock()])).toBe(60)
    expect(
      getRemainingTaskMinutes(makeItem({ estimateMin: 120 }), [
        makeBlock({ durationMin: 60 }),
        makeBlock({ id: 'block-2', durationMin: 60 })
      ])
    ).toBe(0)
  })

  it('ne descend jamais sous zéro', () => {
    expect(
      getRemainingTaskMinutes(makeItem({ estimateMin: 60 }), [makeBlock({ durationMin: 90 })])
    ).toBe(0)
  })

  it('affiche la durée par défaut sans estimation ni bloc', () => {
    expect(getRemainingTaskMinutes(makeItem({ estimateMin: null }), [])).toBe(
      DEFAULT_TASK_DURATION_MIN
    )
  })

  it('affiche zéro sans estimation dès qu’un bloc existe', () => {
    expect(getRemainingTaskMinutes(makeItem({ estimateMin: null }), [makeBlock()])).toBe(0)
  })
})

describe('présence dans « À planifier »', () => {
  it('garde une tâche tant que ses blocs ne couvrent pas son estimation', () => {
    expect(isTaskInInbox(makeItem({ estimateMin: 120 }), [])).toBe(true)
    expect(isTaskInInbox(makeItem({ estimateMin: 120 }), [makeBlock()])).toBe(true)
    expect(
      isTaskInInbox(makeItem({ estimateMin: 120 }), [
        makeBlock({ durationMin: 60 }),
        makeBlock({ id: 'block-2', durationMin: 60 })
      ])
    ).toBe(false)
  })

  it('fait sortir une tâche sans estimation dès qu’elle a un bloc', () => {
    expect(isTaskInInbox(makeItem({ estimateMin: null }), [])).toBe(true)
    expect(isTaskInInbox(makeItem({ estimateMin: null }), [makeBlock()])).toBe(false)
  })

  it('ignore les éléments qui ne sont pas des tâches', () => {
    expect(isTaskInInbox(makeItem({ kind: 'fixed' }), [])).toBe(false)
    expect(isTaskInInbox(makeItem({ kind: 'exam' }), [])).toBe(false)
    expect(isTaskInInbox(makeItem({ kind: 'free' }), [])).toBe(false)
  })

  it('laisse une tâche terminée suivre la même règle de couverture', () => {
    expect(isTaskInInbox(makeItem({ status: 'done' }), [])).toBe(true)
    expect(isTaskInInbox(makeItem({ status: 'done', estimateMin: null }), [makeBlock()])).toBe(
      false
    )
  })
})

describe('liste du panneau', () => {
  it('trie par date de création et joint la catégorie', () => {
    const categories = [makeCategory()]
    const tasks = listInboxTasks(
      [
        makeItem({ id: 'later', createdAt: '2026-11-11T12:00:00.000Z' }),
        makeItem({ id: 'earlier', createdAt: '2026-11-11T08:00:00.000Z' }),
        makeItem({
          id: 'other',
          createdAt: '2026-11-11T09:00:00.000Z',
          categoryId: 'category-2'
        })
      ],
      [],
      categories
    )

    expect(tasks.map((task) => task.item.id)).toEqual(['earlier', 'other', 'later'])
    expect(tasks[0].category).toEqual(categories[0])
    expect(tasks[1].category).toBeNull()
  })

  it('tient compte des blocs répartis sur plusieurs jours', () => {
    const items = [makeItem({ estimateMin: 120 })]
    const blocks = [
      makeBlock({ id: 'monday', date: '2026-11-09', durationMin: 45 }),
      makeBlock({ id: 'wednesday', date: '2026-11-11', durationMin: 45 })
    ]

    expect(listInboxTasks(items, blocks, [])).toEqual([
      {
        item: items[0],
        category: null,
        remainingMin: 30
      }
    ])
  })

  it('ne compte que les blocs de la tâche concernée', () => {
    const items = [makeItem({ id: 'item-1' }), makeItem({ id: 'item-2' })]
    const blocks = [makeBlock({ itemId: 'item-2', durationMin: 120 })]

    expect(listInboxTasks(items, blocks, []).map((task) => task.item.id)).toEqual(['item-1'])
  })
})

describe('ajout rapide', () => {
  it('normalise le titre et accepte une durée vide', () => {
    expect(
      validateQuickTaskDraft({
        title: '  Réviser les suites  ',
        categoryId: 'category-1',
        estimateMin: '   '
      })
    ).toEqual({
      ok: true,
      values: {
        title: 'Réviser les suites',
        categoryId: 'category-1',
        estimateMin: null
      }
    })
  })

  it('accepte une durée estimée entière', () => {
    expect(
      validateQuickTaskDraft({
        title: 'Réviser les suites',
        categoryId: null,
        estimateMin: '45'
      })
    ).toEqual({
      ok: true,
      values: {
        title: 'Réviser les suites',
        categoryId: null,
        estimateMin: 45
      }
    })
  })

  it('refuse un titre vide ou une durée invalide', () => {
    expect(validateQuickTaskDraft({ title: '   ', categoryId: null, estimateMin: '' })).toEqual({
      ok: false,
      message: 'Donnez un titre à la tâche.'
    })

    expect(
      validateQuickTaskDraft({ title: 'Révisions', categoryId: null, estimateMin: '0' })
    ).toEqual({
      ok: false,
      message: 'La durée estimée doit être un nombre entier de minutes.'
    })
  })
})
