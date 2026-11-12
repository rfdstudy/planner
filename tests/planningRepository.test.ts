import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listInboxTasks } from '../src/core/inbox'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import { PlannerDatabase } from '../src/db/database'
import { createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

async function createTask(overrides: { estimateMin?: number | null } = {}): Promise<string> {
  const item = await repositories.items.create({
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'DM Maths',
    estimateMin: overrides.estimateMin ?? null
  })

  return item.id
}

async function createBlock(
  itemId: string,
  date = '2026-11-12',
  startMin = 840,
  durationMin = 60
): Promise<string> {
  const block = await repositories.blocks.create({ itemId, date, startMin, durationMin })
  return block.id
}

async function inboxIds(): Promise<string[]> {
  const [items, blocks, categories, itemTypes] = await Promise.all([
    repositories.items.list(),
    repositories.blocks.list(),
    repositories.categories.list(),
    repositories.itemTypes.list()
  ])

  return listInboxTasks(items, blocks, categories, itemTypes).map((task) => task.item.id)
}

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-planning-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

describe('déplacement d’un bloc', () => {
  it('change le jour et l’heure, puis s’annule', async () => {
    const itemId = await createTask()
    const blockId = await createBlock(itemId)

    const moved = await repositories.planning.moveBlock({
      blockId,
      date: '2026-11-13',
      startMin: 900
    })

    expect(moved.date).toBe('2026-11-13')
    expect(moved.startMin).toBe(900)
    expect(repositories.history.size).toBe(1)

    await repositories.history.undo()

    const restored = await repositories.blocks.get(blockId)
    expect(restored?.date).toBe('2026-11-12')
    expect(restored?.startMin).toBe(840)
    expect(repositories.history.size).toBe(0)
  })

  it('n’enregistre rien quand le bloc ne bouge pas', async () => {
    const itemId = await createTask()
    const blockId = await createBlock(itemId)

    await repositories.planning.moveBlock({ blockId, date: '2026-11-12', startMin: 840 })

    expect(repositories.history.size).toBe(0)
  })

  it('refuse de sortir de la journée', async () => {
    const itemId = await createTask()
    const blockId = await createBlock(itemId)

    await expect(
      repositories.planning.moveBlock({ blockId, date: '2026-11-12', startMin: 1420 })
    ).rejects.toBeInstanceOf(RangeError)
  })
})

describe('redimensionnement d’un bloc', () => {
  it('change la durée, puis s’annule', async () => {
    const itemId = await createTask()
    const blockId = await createBlock(itemId)

    const resized = await repositories.planning.resizeBlock({ blockId, durationMin: 90 })
    expect(resized.durationMin).toBe(90)

    await repositories.history.undo()

    expect((await repositories.blocks.get(blockId))?.durationMin).toBe(60)
  })

  it('refuse une durée qui dépasserait minuit', async () => {
    const itemId = await createTask()
    const blockId = await createBlock(itemId, '2026-11-12', 1380, 60)

    await expect(
      repositories.planning.resizeBlock({ blockId, durationMin: 90 })
    ).rejects.toBeInstanceOf(RangeError)
  })
})

describe('placement d’une tâche', () => {
  it('crée un bloc et l’annule en supprimant ce bloc', async () => {
    const itemId = await createTask({ estimateMin: 120 })

    const block = await repositories.planning.placeTask({
      itemId,
      date: '2026-11-12',
      startMin: 600,
      durationMin: 120
    })

    expect(block.itemId).toBe(itemId)
    expect(await repositories.blocks.listByItem(itemId)).toHaveLength(1)
    expect(repositories.history.size).toBe(1)

    await repositories.history.undo()

    expect(await repositories.blocks.listByItem(itemId)).toHaveLength(0)
    expect(await inboxIds()).toEqual([itemId])
  })

  it('permet plusieurs blocs pour la même tâche', async () => {
    const itemId = await createTask({ estimateMin: 120 })

    await repositories.planning.placeTask({
      itemId,
      date: '2026-11-12',
      startMin: 600,
      durationMin: 45
    })
    await repositories.planning.placeTask({
      itemId,
      date: '2026-11-13',
      startMin: 900,
      durationMin: 30
    })

    expect(await repositories.blocks.listByItem(itemId)).toHaveLength(2)
    expect(repositories.history.size).toBe(2)

    await repositories.history.undo()
    await repositories.history.undo()

    expect(await repositories.blocks.listByItem(itemId)).toHaveLength(0)
  })

  it('refuse un élément qui n’est pas une tâche', async () => {
    const fixed = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
      title: 'Déjeuner'
    })

    await expect(
      repositories.planning.placeTask({
        itemId: fixed.id,
        date: '2026-11-12',
        startMin: 600,
        durationMin: 60
      })
    ).rejects.toBeInstanceOf(RangeError)
  })
})

describe('suppression d’une tâche', () => {
  it('supprime la tâche et ses blocs, puis les restaure à l’annulation', async () => {
    const itemId = await createTask({ estimateMin: 120 })
    const firstBlockId = await createBlock(itemId, '2026-11-12', 600, 60)
    const secondBlockId = await createBlock(itemId, '2026-11-13', 900, 60)

    const result = await repositories.planning.deleteTask(itemId)

    expect(result.blockCount).toBe(2)
    expect(await repositories.items.get(itemId)).toBeUndefined()
    expect(await repositories.blocks.listByItem(itemId)).toHaveLength(0)
    expect(await repositories.blocks.get(firstBlockId)).toBeUndefined()
    expect(await repositories.blocks.get(secondBlockId)).toBeUndefined()
    expect(repositories.history.size).toBe(1)

    await repositories.history.undo()

    expect((await repositories.items.get(itemId))?.deletedAt).toBeNull()
    expect(await repositories.blocks.listByItem(itemId)).toHaveLength(2)
    expect((await repositories.blocks.get(firstBlockId))?.deletedAt).toBeNull()
    expect((await repositories.blocks.get(secondBlockId))?.deletedAt).toBeNull()
    expect(repositories.history.size).toBe(0)
  })
})

describe('retrait d’un bloc vers le panneau', () => {
  it('retire le bloc et s’annule en le restaurant', async () => {
    const itemId = await createTask({ estimateMin: 60 })
    const blockId = await createBlock(itemId)

    await repositories.planning.removeBlock(blockId)

    expect(await repositories.blocks.get(blockId)).toBeUndefined()
    expect(await inboxIds()).toEqual([itemId])

    await repositories.history.undo()

    expect((await repositories.blocks.get(blockId))?.deletedAt).toBeNull()
    expect(await inboxIds()).toEqual([])
  })

  it('laisse la tâche hors du panneau s’il reste un autre bloc couvrant l’estimation', async () => {
    const itemId = await createTask({ estimateMin: 60 })
    const first = await createBlock(itemId, '2026-11-12', 600, 60)
    await createBlock(itemId, '2026-11-13', 600, 60)

    await repositories.planning.removeBlock(first)

    expect(await inboxIds()).toEqual([])
  })
})
