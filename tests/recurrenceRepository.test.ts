import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computeOccurrences, type TemplateOccurrence } from '../src/core/recurrence'
import type { Template } from '../src/core/types'
import { PlannerDatabase } from '../src/db/database'
import { createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

const WEEK = { start: '2026-11-09', end: '2026-11-15' }
const MONDAY = '2026-11-09'
const WEDNESDAY = '2026-11-11'

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-recurrence-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

async function createTemplate(): Promise<Template> {
  return repositories.templates.create({
    kind: 'fixed',
    title: 'Cours',
    categoryId: null,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
    startMin: 8 * 60,
    durationMin: 120,
    validFrom: MONDAY,
    validUntil: null
  })
}

async function occurrences(): Promise<TemplateOccurrence[]> {
  const [templates, overrides] = await Promise.all([
    repositories.templates.list(),
    repositories.overrides.list()
  ])

  return computeOccurrences(templates, overrides, WEEK)
}

describe('semaine type : cette fois seulement', () => {
  it('modifie une occurrence par une exception sans toucher au modèle', async () => {
    const template = await createTemplate()

    await repositories.recurrence.editOccurrenceOnce({
      templateId: template.id,
      date: WEDNESDAY,
      kind: 'fixed',
      title: 'Cours décalé',
      categoryId: null,
      startMin: 10 * 60,
      durationMin: 90
    })

    const week = await occurrences()
    const modified = week.find((occurrence) => occurrence.date === WEDNESDAY)

    expect(modified).toMatchObject({
      title: 'Cours décalé',
      startMin: 600,
      durationMin: 90,
      overrideId: expect.any(String)
    })
    expect(week.find((occurrence) => occurrence.date === MONDAY)?.title).toBe('Cours')
    expect((await repositories.templates.get(template.id))?.title).toBe('Cours')
  })

  it('supprime une occurrence par une exception de type skip', async () => {
    const template = await createTemplate()

    await repositories.recurrence.deleteOccurrenceOnce(template.id, WEDNESDAY)

    expect((await occurrences()).map((occurrence) => occurrence.date)).toEqual([MONDAY])
    expect((await repositories.overrides.list())[0]).toMatchObject({
      templateId: template.id,
      date: WEDNESDAY,
      action: 'skip'
    })
  })

  it('recrée un bloc autonome après un déplacement vers un autre jour', async () => {
    const template = await createTemplate()

    await repositories.recurrence.moveOccurrenceOnce({
      templateId: template.id,
      date: MONDAY,
      targetDate: '2026-11-10',
      kind: 'fixed',
      title: 'Cours',
      categoryId: null,
      startMin: 14 * 60,
      durationMin: 120
    })

    expect((await occurrences()).map((occurrence) => occurrence.date)).toEqual([WEDNESDAY])
    expect((await repositories.overrides.list())[0]).toMatchObject({
      date: MONDAY,
      action: 'skip'
    })

    const items = await repositories.items.list()
    const movedItem = items.find((item) => item.templateId === template.id)
    expect(movedItem?.title).toBe('Cours')
    expect(movedItem).toBeDefined()

    const blocks = await repositories.blocks.listByDate('2026-11-10')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ startMin: 840, durationMin: 120 })
  })
})

describe('semaine type : toutes les semaines', () => {
  it('modifie le modèle entier', async () => {
    const template = await createTemplate()

    await repositories.recurrence.updateOccurrenceEveryWeek({
      templateId: template.id,
      date: MONDAY,
      targetDate: MONDAY,
      kind: 'free',
      title: 'Sport',
      categoryId: null,
      startMin: 18 * 60,
      durationMin: 60
    })

    const updated = await repositories.templates.get(template.id)
    expect(updated).toMatchObject({
      kind: 'free',
      title: 'Sport',
      startMin: 1080,
      durationMin: 60
    })

    const week = await occurrences()
    expect(week.map((occurrence) => occurrence.title)).toEqual(['Sport', 'Sport'])
  })

  it('retire un jour du modèle, puis supprime le modèle quand c’était le dernier', async () => {
    const template = await createTemplate()

    await repositories.recurrence.deleteOccurrenceEveryWeek(template.id, WEDNESDAY)

    expect((await repositories.templates.get(template.id))?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect((await occurrences()).map((occurrence) => occurrence.date)).toEqual([MONDAY])

    await repositories.recurrence.deleteOccurrenceEveryWeek(template.id, MONDAY)

    expect(await repositories.templates.get(template.id)).toBeUndefined()
    expect(await occurrences()).toEqual([])
  })

  it('déplace le jour du modèle pour toutes les semaines', async () => {
    const template = await createTemplate()

    await repositories.recurrence.moveOccurrenceEveryWeek({
      templateId: template.id,
      date: MONDAY,
      targetDate: '2026-11-10',
      kind: 'fixed',
      title: 'Cours',
      categoryId: null,
      startMin: 9 * 60,
      durationMin: 120
    })

    const updated = await repositories.templates.get(template.id)
    expect(updated?.rrule).toBe('FREQ=WEEKLY;BYDAY=TU,WE')
    expect(updated?.startMin).toBe(540)
    expect((await occurrences()).map((occurrence) => occurrence.date)).toEqual([
      '2026-11-10',
      WEDNESDAY
    ])
  })
})
