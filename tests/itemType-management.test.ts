import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import { PlannerDatabase } from '../src/db/database'
import { createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-item-types-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

describe('gestion des types d’éléments', () => {
  it('crée les cinq types de départ sur une base neuve', async () => {
    const types = await repositories.itemTypes.listActive()

    expect(types.map((type) => type.name)).toEqual([
      'Tâche',
      'Fixe',
      'Épreuve',
      'Libre',
      'Événement'
    ])
  })

  it('réaffecte éléments, modèles et exceptions avant de supprimer un type', async () => {
    const taskTypeId = DEFAULT_ITEM_TYPE_IDS.task
    const fixedTypeId = DEFAULT_ITEM_TYPE_IDS.fixed
    const item = await repositories.items.create({
      typeId: taskTypeId,
      title: 'DM Maths',
      estimateMin: 60
    })
    const template = await repositories.templates.create({
      typeId: fixedTypeId,
      title: 'Cours',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMin: 480,
      durationMin: 60,
      validFrom: '2026-11-02'
    })
    const override = await repositories.overrides.create({
      templateId: template.id,
      date: '2026-11-09',
      action: 'modify',
      typeId: taskTypeId,
      title: 'Cours décalé',
      categoryId: null,
      startMin: 600,
      durationMin: 60
    })

    const usage = await repositories.itemTypes.getUsage(taskTypeId)
    expect(usage).toEqual({
      typeId: taskTypeId,
      items: 1,
      templates: 0,
      overrides: 1,
      total: 2
    })

    const result = await repositories.itemTypes.deleteWithReassignment(taskTypeId, fixedTypeId)

    expect(result).toEqual({
      typeId: taskTypeId,
      replacementTypeId: fixedTypeId,
      reassignedItems: 1,
      reassignedTemplates: 0,
      reassignedOverrides: 1
    })
    expect((await repositories.items.get(item.id))?.typeId).toBe(fixedTypeId)
    expect((await repositories.overrides.get(override.id))?.typeId).toBe(fixedTypeId)
    expect(await repositories.itemTypes.get(taskTypeId)).toBeUndefined()
  })

  it('refuse de supprimer un type utilisé sans type de remplacement', async () => {
    const taskTypeId = DEFAULT_ITEM_TYPE_IDS.task
    const item = await repositories.items.create({
      typeId: taskTypeId,
      title: 'DM Maths'
    })

    await expect(
      repositories.itemTypes.deleteWithReassignment(taskTypeId, null)
    ).rejects.toBeInstanceOf(RangeError)

    expect(await repositories.itemTypes.get(taskTypeId)).toBeDefined()
    expect((await repositories.items.get(item.id))?.typeId).toBe(taskTypeId)
  })

  it('supprime sans remplacement un type inutilisé', async () => {
    const eventTypeId = DEFAULT_ITEM_TYPE_IDS.event

    const result = await repositories.itemTypes.deleteWithReassignment(eventTypeId, null)

    expect(result.replacementTypeId).toBeNull()
    expect(await repositories.itemTypes.get(eventTypeId)).toBeUndefined()
  })

  it('applique immédiatement les nouvelles propriétés à tous les éléments', async () => {
    const fixedTypeId = DEFAULT_ITEM_TYPE_IDS.fixed
    const item = await repositories.items.create({
      typeId: fixedTypeId,
      title: 'Déjeuner'
    })

    const updated = await repositories.itemTypes.updateDetails(fixedTypeId, {
      name: 'Repas',
      style: 'category',
      color: null,
      isTask: true,
      countdown: true,
      placement: 'topLine'
    })

    expect(updated).toMatchObject({
      name: 'Repas',
      style: 'category',
      isTask: true,
      countdown: true,
      placement: 'topLine'
    })

    const typeOfItem = await repositories.itemTypes.get(
      (await repositories.items.get(item.id))?.typeId ?? ''
    )
    expect(typeOfItem).toMatchObject({
      name: 'Repas',
      isTask: true,
      countdown: true,
      placement: 'topLine'
    })
  })

  it('archive puis restaure un type à la fin de la liste', async () => {
    const taskTypeId = DEFAULT_ITEM_TYPE_IDS.task
    const archived = await repositories.itemTypes.archive(taskTypeId)

    expect(archived.archivedAt).not.toBeNull()
    expect((await repositories.itemTypes.listActive()).some((type) => type.id === taskTypeId)).toBe(
      false
    )

    const restored = await repositories.itemTypes.restore(taskTypeId)
    expect(restored.archivedAt).toBeNull()
    expect(restored.order).toBe(5)
  })
})
