import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlannerDatabase } from '../src/db/database'
import { RecordNotFoundError, createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-elements-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

const ITEM = {
  kind: 'task' as const,
  title: 'Révisions',
  notes: 'Fiche 5',
  categoryId: null,
  estimateMin: 90,
  status: 'todo' as const
}

describe('édition d’un élément et de son bloc', () => {
  it('crée l’élément et le bloc ensemble', async () => {
    const saved = await repositories.elements.create({
      item: ITEM,
      block: { date: '2026-11-12', startMin: 840, durationMin: 60 }
    })

    expect(saved.block.itemId).toBe(saved.item.id)
    expect(await repositories.items.get(saved.item.id)).toEqual(saved.item)
    expect(await repositories.blocks.get(saved.block.id)).toEqual(saved.block)
    expect(await repositories.blocks.listByItem(saved.item.id)).toHaveLength(1)
  })

  it('modifie les champs de l’élément et la position du bloc', async () => {
    const saved = await repositories.elements.create({
      item: ITEM,
      block: { date: '2026-11-12', startMin: 840, durationMin: 60 }
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const updated = await repositories.elements.update({
      itemId: saved.item.id,
      blockId: saved.block.id,
      item: {
        ...ITEM,
        title: 'Révisions DS',
        status: 'done'
      },
      block: { date: '2026-11-13', startMin: 900, durationMin: 45 }
    })

    expect(updated.item.title).toBe('Révisions DS')
    expect(updated.item.status).toBe('done')
    expect(updated.item.updatedAt > saved.item.updatedAt).toBe(true)
    expect(updated.block.date).toBe('2026-11-13')
    expect(updated.block.startMin).toBe(900)
    expect(updated.block.durationMin).toBe(45)
    expect(await repositories.blocks.listByDate('2026-11-12')).toHaveLength(0)
  })

  it('refuse de modifier un bloc qui appartient à un autre élément', async () => {
    const first = await repositories.elements.create({
      item: ITEM,
      block: { date: '2026-11-12', startMin: 840, durationMin: 60 }
    })
    const second = await repositories.elements.create({
      item: { ...ITEM, title: 'Autre tâche' },
      block: { date: '2026-11-12', startMin: 960, durationMin: 30 }
    })

    await expect(
      repositories.elements.update({
        itemId: first.item.id,
        blockId: second.block.id,
        item: { ...ITEM, title: 'Ne doit pas être écrit' },
        block: { date: '2026-11-13', startMin: 900, durationMin: 45 }
      })
    ).rejects.toBeInstanceOf(RecordNotFoundError)

    expect((await repositories.items.get(first.item.id))?.title).toBe('Révisions')
    expect((await repositories.blocks.get(second.block.id))?.date).toBe('2026-11-12')
  })

  it('coche une tâche et refuse le statut sur un autre type', async () => {
    const task = await repositories.elements.create({
      item: ITEM,
      block: { date: '2026-11-12', startMin: 840, durationMin: 60 }
    })

    const done = await repositories.items.setTaskStatus(task.item.id, 'done')
    expect(done.status).toBe('done')

    const fixed = await repositories.items.create({ kind: 'fixed', title: 'Déjeuner' })

    await expect(repositories.items.setTaskStatus(fixed.id, 'done')).rejects.toBeInstanceOf(
      RangeError
    )
  })
})
