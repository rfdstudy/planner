import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listInboxTasks } from '../src/core/inbox'
import { PlannerDatabase } from '../src/db/database'
import { DEMO_WEEK_START, DEMO_WEEK_LOADED_SETTING_KEY, loadDemoWeek } from '../src/db/demoWeek'
import { createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-demo-week-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

describe('données de démonstration', () => {
  it('crée la semaine de la maquette et reste idempotent', async () => {
    const first = await loadDemoWeek(repositories)

    expect(first).toEqual({ weekStart: DEMO_WEEK_START, alreadyLoaded: false })

    const categories = await repositories.categories.listActive()
    expect(categories.map((category) => category.name)).toEqual(
      expect.arrayContaining(['Maths', 'Info', 'Physique', 'Anglais', 'Projet'])
    )

    const blocks = await repositories.blocks.listBetween('2026-11-09', '2026-11-15')
    expect(blocks).toHaveLength(45)
    expect(blocks.filter((block) => block.startMin === null)).toHaveLength(1)
    expect(
      blocks.find((block) => block.date === '2026-11-12' && block.startMin === null)
    ).toBeDefined()

    const [items, itemTypes] = await Promise.all([
      repositories.items.list(),
      repositories.itemTypes.list()
    ])
    const itemIds = new Set(items.map((item) => item.id))
    expect(blocks.every((block) => itemIds.has(block.itemId))).toBe(true)

    const inbox = listInboxTasks(items, blocks, categories, itemTypes)

    expect(inbox.map((task) => task.item.title).sort((a, b) => a.localeCompare(b, 'fr'))).toEqual(
      [
        'DM Maths n°4',
        'Feuille d’exercices n°7',
        'Fiche chapitre 5',
        'Synthèse d’anglais',
        'TP OCaml'
      ].sort((a, b) => a.localeCompare(b, 'fr'))
    )
    expect(inbox.find((task) => task.item.title === 'DM Maths n°4')?.remainingMin).toBe(60)

    const second = await loadDemoWeek(repositories)

    expect(second).toEqual({ weekStart: DEMO_WEEK_START, alreadyLoaded: true })
    expect(await repositories.blocks.listBetween('2026-11-09', '2026-11-15')).toHaveLength(45)
    expect(await repositories.settings.getByKey(DEMO_WEEK_LOADED_SETTING_KEY)).toBeDefined()
  })
})
