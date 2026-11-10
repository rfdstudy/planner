import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlannerDatabase } from '../src/db/database'
import { RecordDeletedError, createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

function waitForNextTimestamp(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-repositories-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

describe('repositories', () => {
  it('met à jour puis supprime logiquement un enregistrement', async () => {
    const group = await repositories.categoryGroups.create({ name: 'Matières', order: 0 })

    expect(group.deletedAt).toBeNull()

    await waitForNextTimestamp()
    const updated = await repositories.categoryGroups.update(group.id, {
      name: 'Projets',
      order: 1
    })

    expect(updated.name).toBe('Projets')
    expect(updated.order).toBe(1)
    expect(updated.updatedAt > group.updatedAt).toBe(true)

    await waitForNextTimestamp()
    const deleted = await repositories.categoryGroups.softDelete(group.id)

    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.updatedAt).toBe(deleted.deletedAt)
    expect(await repositories.categoryGroups.get(group.id)).toBeUndefined()
    expect(
      (await repositories.categoryGroups.get(group.id, { includeDeleted: true }))?.deletedAt
    ).toBe(deleted.deletedAt)
    expect(await repositories.categoryGroups.list()).toEqual([])
    expect(await repositories.categoryGroups.list({ includeDeleted: true })).toHaveLength(1)

    await expect(
      repositories.categoryGroups.update(group.id, { name: 'Impossible' })
    ).rejects.toBeInstanceOf(RecordDeletedError)
  })

  it('retrouve un réglage par sa clé et conserve une valeur JSON', async () => {
    const setting = await repositories.settings.create({
      key: 'theme',
      value: { mode: 'light', zoom: 1 }
    })

    expect(await repositories.settings.getByKey('theme')).toEqual(setting)

    const updated = await repositories.settings.update(setting.id, {
      value: { mode: 'dark', zoom: 1.25 }
    })
    expect(updated.value).toEqual({ mode: 'dark', zoom: 1.25 })

    await repositories.settings.softDelete(setting.id)

    expect(await repositories.settings.getByKey('theme')).toBeUndefined()
    expect((await repositories.settings.getByKey('theme', { includeDeleted: true }))?.id).toBe(
      setting.id
    )
  })

  it('lit les blocs par date, par plage et par tâche, avec plusieurs blocs possibles', async () => {
    const item = await repositories.items.create({
      kind: 'task',
      title: 'Révisions',
      estimateMin: 120
    })

    const first = await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: 540,
      durationMin: 45
    })
    await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: 630,
      durationMin: 45
    })
    await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-13',
      startMin: 480,
      durationMin: 30
    })

    expect(await repositories.blocks.listByDate('2026-11-12')).toHaveLength(2)
    expect(await repositories.blocks.listBetween('2026-11-12', '2026-11-13')).toHaveLength(3)
    expect(await repositories.blocks.listByItem(item.id)).toHaveLength(3)

    await repositories.blocks.softDelete(first.id)

    expect(await repositories.blocks.listByDate('2026-11-12')).toHaveLength(1)
    expect(await repositories.blocks.listByItem(item.id)).toHaveLength(2)
  })
})
