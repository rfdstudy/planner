import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlannerDatabase } from '../src/db/database'
import {
  RecordDeletedError,
  RecordNotFoundError,
  createRepositories,
  type Repositories
} from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

function waitForNextTimestamp(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

async function createFixture(): Promise<{
  sourceCategoryId: string
  targetCategoryId: string
  itemId: string
  untouchedItemId: string
  templateId: string
  overrideId: string
  blockId: string
}> {
  const group = await repositories.categoryGroups.create({ name: 'Matières', order: 0 })
  const source = await repositories.categories.create({
    name: 'Mathématiques',
    color: '#1F2328',
    groupId: group.id,
    order: 0
  })
  const target = await repositories.categories.create({
    name: 'Physique',
    color: '#4B525B',
    groupId: group.id,
    order: 1
  })
  const item = await repositories.items.create({
    kind: 'task',
    title: 'DM de mathématiques',
    categoryId: source.id,
    estimateMin: 90
  })
  const untouchedItem = await repositories.items.create({
    kind: 'task',
    title: 'Lecture',
    categoryId: target.id,
    estimateMin: 30
  })
  const template = await repositories.templates.create({
    kind: 'fixed',
    title: 'Cours de mathématiques',
    categoryId: source.id,
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    startMin: 480,
    durationMin: 60,
    validFrom: '2026-11-09'
  })
  const override = await repositories.overrides.create({
    templateId: template.id,
    date: '2026-11-16',
    action: 'modify',
    categoryId: source.id,
    startMin: 540
  })
  const block = await repositories.blocks.create({
    itemId: item.id,
    date: '2026-11-12',
    startMin: 540,
    durationMin: 45
  })

  return {
    sourceCategoryId: source.id,
    targetCategoryId: target.id,
    itemId: item.id,
    untouchedItemId: untouchedItem.id,
    templateId: template.id,
    overrideId: override.id,
    blockId: block.id
  }
}

describe('suppression d’une catégorie avec réaffectation', () => {
  it('réaffecte les éléments et les modèles, puis supprime la catégorie', async () => {
    const {
      sourceCategoryId,
      targetCategoryId,
      itemId,
      untouchedItemId,
      templateId,
      overrideId,
      blockId
    } = await createFixture()
    const sourceBefore = await repositories.categories.get(sourceCategoryId)
    const itemBefore = await repositories.items.get(itemId)
    const templateBefore = await repositories.templates.get(templateId)
    const overrideBefore = await repositories.overrides.get(overrideId)
    const untouchedItemBefore = await repositories.items.get(untouchedItemId)

    expect(sourceBefore).toBeDefined()
    expect(itemBefore).toBeDefined()
    expect(templateBefore).toBeDefined()
    expect(overrideBefore).toBeDefined()
    expect(untouchedItemBefore).toBeDefined()

    await waitForNextTimestamp()

    const result = await repositories.categories.deleteWithReassignment(
      sourceCategoryId,
      targetCategoryId
    )

    expect(result).toEqual({
      categoryId: sourceCategoryId,
      replacementCategoryId: targetCategoryId,
      reassignedItems: 1,
      reassignedTemplates: 1,
      reassignedOverrides: 1
    })

    // La catégorie disparaît des lectures normales mais reste en base.
    expect(await repositories.categories.get(sourceCategoryId)).toBeUndefined()
    const deletedCategory = await repositories.categories.get(sourceCategoryId, {
      includeDeleted: true
    })
    expect(deletedCategory?.deletedAt).not.toBeNull()
    expect(deletedCategory?.updatedAt).toBe(deletedCategory?.deletedAt)
    expect(deletedCategory?.updatedAt).not.toBe(sourceBefore?.updatedAt)

    const reassignedItem = await repositories.items.get(itemId)
    expect(reassignedItem?.categoryId).toBe(targetCategoryId)
    expect(reassignedItem?.updatedAt).not.toBe(itemBefore?.updatedAt)

    const reassignedTemplate = await repositories.templates.get(templateId)
    expect(reassignedTemplate?.categoryId).toBe(targetCategoryId)
    expect(reassignedTemplate?.updatedAt).not.toBe(templateBefore?.updatedAt)

    const reassignedOverride = await repositories.overrides.get(overrideId)
    expect(reassignedOverride?.categoryId).toBe(targetCategoryId)
    expect(reassignedOverride?.updatedAt).not.toBe(overrideBefore?.updatedAt)

    // Les autres éléments et les blocs ne sont pas touchés.
    const untouchedItem = await repositories.items.get(untouchedItemId)
    expect(untouchedItem?.categoryId).toBe(targetCategoryId)
    expect(untouchedItem?.updatedAt).toBe(untouchedItemBefore?.updatedAt)

    const untouchedBlock = await repositories.blocks.get(blockId)
    expect(untouchedBlock?.itemId).toBe(itemId)
    expect(untouchedBlock).toBeDefined()

    const visibleCategories = await repositories.categories.list()
    expect(visibleCategories.map((category) => category.id)).toEqual([targetCategoryId])
  })

  it('laisse les éléments sans catégorie quand le remplacement est nul', async () => {
    const { sourceCategoryId, itemId, templateId } = await createFixture()

    const result = await repositories.categories.deleteWithReassignment(sourceCategoryId, null)

    expect(result.replacementCategoryId).toBeNull()
    expect((await repositories.items.get(itemId))?.categoryId).toBeNull()
    expect((await repositories.templates.get(templateId))?.categoryId).toBeNull()
  })

  it('refuse une catégorie de remplacement supprimée sans rien modifier', async () => {
    const { sourceCategoryId, targetCategoryId, itemId } = await createFixture()
    await repositories.categories.softDelete(targetCategoryId)

    await expect(
      repositories.categories.deleteWithReassignment(sourceCategoryId, targetCategoryId)
    ).rejects.toBeInstanceOf(RecordDeletedError)

    expect(await repositories.categories.get(sourceCategoryId)).toBeDefined()
    expect((await repositories.items.get(itemId))?.categoryId).toBe(sourceCategoryId)
  })

  it('refuse une catégorie de remplacement inexistante', async () => {
    const { sourceCategoryId, itemId } = await createFixture()

    await expect(
      repositories.categories.deleteWithReassignment(sourceCategoryId, 'categorie-inconnue')
    ).rejects.toBeInstanceOf(RecordNotFoundError)

    expect(await repositories.categories.get(sourceCategoryId)).toBeDefined()
    expect((await repositories.items.get(itemId))?.categoryId).toBe(sourceCategoryId)
  })

  it('refuse de réaffecter une catégorie à elle-même', async () => {
    const { sourceCategoryId, itemId } = await createFixture()

    await expect(
      repositories.categories.deleteWithReassignment(sourceCategoryId, sourceCategoryId)
    ).rejects.toBeInstanceOf(RangeError)

    expect(await repositories.categories.get(sourceCategoryId)).toBeDefined()
    expect((await repositories.items.get(itemId))?.categoryId).toBe(sourceCategoryId)
  })
})
