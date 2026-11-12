import { describe, expect, it } from 'vitest'
import { buildCalendarIcs, escapeIcsText, foldIcsLine } from '../src/core/ics'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import type { Block, Category, Item, Override, Template } from '../src/core/types'

const TIMESTAMP = new Date(Date.UTC(2026, 10, 11, 20, 0, 0))

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

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    deletedAt: null,
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Réviser les suites',
    notes: 'Chapitre 2, exercices 4 à 7',
    categoryId: 'category-1',
    estimateMin: 60,
    status: 'todo',
    templateId: null,
    ...overrides
  }
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    deletedAt: null,
    itemId: 'item-1',
    date: '2026-11-12',
    startMin: 14 * 60,
    durationMin: 60,
    ...overrides
  }
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'template-1',
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    deletedAt: null,
    typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
    title: 'Cours de maths',
    categoryId: 'category-1',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
    startMin: 8 * 60,
    durationMin: 120,
    validFrom: '2026-11-09',
    validUntil: '2026-12-31',
    ...overrides
  }
}

function makeOverride(overrides: Partial<Override> = {}): Override {
  return {
    id: 'override-1',
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    deletedAt: null,
    templateId: 'template-1',
    date: '2026-11-11',
    action: 'skip',
    typeId: null,
    title: null,
    categoryId: null,
    startMin: null,
    durationMin: null,
    ...overrides
  }
}

describe('export iCalendar', () => {
  it('exporte un bloc horaire avec titre, notes et catégorie', () => {
    const ics = buildCalendarIcs({
      items: [makeItem()],
      blocks: [makeBlock()],
      templates: [],
      overrides: [],
      categories: [makeCategory()],
      now: TIMESTAMP
    })

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTAMP:20261111T200000Z\r\n')
    expect(ics).toContain('DTSTART:20261112T140000\r\n')
    expect(ics).toContain('DTEND:20261112T150000\r\n')
    expect(ics).toContain('SUMMARY:Réviser les suites\r\n')
    expect(ics).toContain('DESCRIPTION:Chapitre 2\\, exercices 4 à 7\r\n')
    expect(ics).toContain('CATEGORIES:Maths\r\n')
  })

  it('exporte une épreuve sans heure comme une journée entière', () => {
    const ics = buildCalendarIcs({
      items: [
        makeItem({
          typeId: DEFAULT_ITEM_TYPE_IDS.exam,
          title: 'DS de maths',
          categoryId: null
        })
      ],
      blocks: [makeBlock({ startMin: null })],
      templates: [],
      overrides: [],
      categories: []
    })

    expect(ics).toContain('DTSTART;VALUE=DATE:20261112\r\n')
    expect(ics).toContain('DTEND;VALUE=DATE:20261113\r\n')
  })

  it('exporte un modèle avec sa règle, ses exceptions et ses modifications', () => {
    const ics = buildCalendarIcs({
      items: [],
      blocks: [],
      templates: [makeTemplate()],
      overrides: [
        makeOverride(),
        makeOverride({
          id: 'override-2',
          date: '2026-11-16',
          action: 'modify',
          title: 'Cours déplacé',
          startMin: 10 * 60,
          durationMin: 90
        })
      ],
      categories: [makeCategory()],
      now: TIMESTAMP
    })

    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959\r\n')
    expect(ics).toContain('EXDATE:20261111T080000,20261116T080000\r\n')
    expect(ics).toContain('SUMMARY:Cours déplacé\r\n')
    expect(ics).toContain('DTSTART:20261116T100000\r\n')
    expect(ics).toContain('DTEND:20261116T113000\r\n')
  })

  it('ignore les éléments supprimés et les blocs orphelins', () => {
    const ics = buildCalendarIcs({
      items: [makeItem({ deletedAt: '2026-11-11T10:00:00.000Z' })],
      blocks: [
        makeBlock(),
        makeBlock({ id: 'block-2', itemId: 'inconnu' }),
        makeBlock({ id: 'block-3', deletedAt: '2026-11-11T10:00:00.000Z' })
      ],
      templates: [],
      overrides: [],
      categories: [makeCategory()]
    })

    expect(ics).not.toContain('SUMMARY:Réviser les suites')
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(0)
  })

  it('échappe les caractères réservés et plie les lignes longues', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')

    const folded = foldIcsLine(`SUMMARY:${'é'.repeat(80)}`)
    const lines = folded.split('\r\n')

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true)
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
  })
})
