import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import { PlannerDatabase } from '../src/db/database'
import { createRepositories, type Repositories } from '../src/db/repositories'
import {
  GROUPS_INITIALIZED_SETTING_KEY,
  ONBOARDING_COMPLETED_SETTING_KEY,
  finishOnboarding,
  prepareApplication
} from '../src/db/startup'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-category-management-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

describe('démarrage de l’application', () => {
  it('crée les groupes Matières et Projets au premier lancement', async () => {
    const startup = await prepareApplication(repositories)
    const groups = await repositories.categoryGroups.list()

    expect(startup.firstLaunch).toBe(true)
    expect(groups.map((group) => group.name).sort()).toEqual(['Matières', 'Projets'])
    expect(groups.map((group) => group.order).sort()).toEqual([0, 1])
    expect(await repositories.settings.getByKey(GROUPS_INITIALIZED_SETTING_KEY)).toBeDefined()
  })

  it('retient que l’accueil a été terminé et conserve les catégories créées', async () => {
    await prepareApplication(repositories)
    const groups = await repositories.categoryGroups.list()
    const matieres = groups.find((group) => group.name === 'Matières')

    expect(matieres).toBeDefined()

    await finishOnboarding(repositories, [
      { name: 'Mathématiques', color: '#3E63DD', groupId: matieres?.id ?? null }
    ])

    expect(await repositories.settings.getByKey(ONBOARDING_COMPLETED_SETTING_KEY)).toBeDefined()

    // Le même passage de repositories ne repropose plus l'accueil.
    expect((await prepareApplication(repositories)).firstLaunch).toBe(false)

    // Nouveau passage de repositories sur la même base : pas de doublon, accueil passé.
    const freshRepositories = createRepositories(database)
    const startup = await prepareApplication(freshRepositories)

    expect(startup.firstLaunch).toBe(false)
    expect(await freshRepositories.categoryGroups.list()).toHaveLength(2)
    expect(await freshRepositories.categories.list()).toHaveLength(1)
  })

  it('ne recrée pas les groupes après leur suppression', async () => {
    await prepareApplication(repositories)
    const groups = await repositories.categoryGroups.list()

    for (const group of groups) {
      await repositories.categoryGroups.softDelete(group.id)
    }

    const freshRepositories = createRepositories(database)
    await prepareApplication(freshRepositories)

    expect(await freshRepositories.categoryGroups.list()).toHaveLength(0)
  })
})

describe('gestion des catégories', () => {
  it('attribue un ordre croissant à la création puis réordonne', async () => {
    const group = await repositories.categoryGroups.create({ name: 'Matières' })
    const first = await repositories.categories.create({
      name: 'Maths',
      color: '#3E63DD',
      groupId: group.id
    })
    const second = await repositories.categories.create({
      name: 'Physique',
      color: '#12A594',
      groupId: group.id
    })
    const third = await repositories.categories.create({
      name: 'Anglais',
      color: '#F2730D',
      groupId: group.id
    })

    expect([first.order, second.order, third.order]).toEqual([0, 1, 2])

    await repositories.categories.reorder([third.id, first.id, second.id])

    const reordered = await repositories.categories.listActive()
    expect(reordered.map((category) => category.name)).toEqual(['Anglais', 'Maths', 'Physique'])
    expect(reordered.map((category) => category.order)).toEqual([0, 1, 2])
  })

  it('refuse une liste de réordonnancement contenant un doublon', async () => {
    const category = await repositories.categories.create({
      name: 'Maths',
      color: '#3E63DD'
    })

    await expect(
      repositories.categories.reorder([category.id, category.id])
    ).rejects.toBeInstanceOf(RangeError)
  })

  it('place une catégorie à la fin de son nouveau groupe', async () => {
    const matieres = await repositories.categoryGroups.create({ name: 'Matières' })
    const projets = await repositories.categoryGroups.create({ name: 'Projets' })
    const maths = await repositories.categories.create({
      name: 'Maths',
      color: '#3E63DD',
      groupId: matieres.id
    })
    await repositories.categories.create({
      name: 'Physique',
      color: '#12A594',
      groupId: matieres.id
    })
    const planner = await repositories.categories.create({
      name: 'Planner',
      color: '#30A46C',
      groupId: projets.id
    })

    const moved = await repositories.categories.updateDetails(maths.id, {
      name: 'Maths',
      color: '#3E63DD',
      groupId: projets.id
    })

    expect(moved.groupId).toBe(projets.id)
    expect(moved.order).toBe(planner.order + 1)
  })

  it('archive puis restaure une catégorie à la fin de son groupe', async () => {
    const group = await repositories.categoryGroups.create({ name: 'Matières' })
    const archived = await repositories.categories.create({
      name: 'Histoire',
      color: '#D6409F',
      groupId: group.id
    })
    const remaining = await repositories.categories.create({
      name: 'Géographie',
      color: '#6E56CF',
      groupId: group.id
    })

    const afterArchive = await repositories.categories.archive(archived.id)
    expect(afterArchive.archivedAt).not.toBeNull()
    expect((await repositories.categories.listActive()).map((category) => category.id)).toEqual([
      remaining.id
    ])
    expect((await repositories.categories.listArchived()).map((category) => category.id)).toEqual([
      archived.id
    ])

    const restored = await repositories.categories.restore(archived.id)
    expect(restored.archivedAt).toBeNull()
    expect(restored.order).toBe(remaining.order + 1)
  })

  it('compte les éléments, modèles et exceptions qui utilisent la catégorie', async () => {
    const category = await repositories.categories.create({
      name: 'Maths',
      color: '#3E63DD'
    })
    const otherCategory = await repositories.categories.create({
      name: 'Physique',
      color: '#12A594'
    })
    await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'DM',
      categoryId: category.id
    })
    await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Ancien DM',
      categoryId: category.id
    })
    await repositories.templates.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
      title: 'Cours',
      categoryId: category.id,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMin: 480,
      durationMin: 60,
      validFrom: '2026-11-09'
    })
    await repositories.overrides.create({
      templateId: 'modele',
      date: '2026-11-16',
      action: 'modify',
      categoryId: category.id
    })
    await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Lecture',
      categoryId: otherCategory.id
    })

    const deletedItem = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Supprimé',
      categoryId: category.id
    })
    await repositories.items.softDelete(deletedItem.id)

    expect(await repositories.categories.getUsage(category.id)).toEqual({
      categoryId: category.id,
      items: 2,
      templates: 1,
      overrides: 1,
      total: 4
    })
  })

  it('supprime un groupe en conservant ses catégories sans groupe', async () => {
    const group = await repositories.categoryGroups.create({ name: 'Matières' })
    const category = await repositories.categories.create({
      name: 'Maths',
      color: '#3E63DD',
      groupId: group.id
    })

    const reassigned = await repositories.categoryGroups.deleteWithCategoryUnassignment(group.id)

    expect(reassigned).toBe(1)
    expect(await repositories.categoryGroups.get(group.id)).toBeUndefined()
    expect((await repositories.categories.get(category.id))?.groupId).toBeNull()
  })
})

describe('gestion des groupes', () => {
  it('réordonne les groupes selon la liste fournie', async () => {
    const matieres = await repositories.categoryGroups.create({ name: 'Matières' })
    const projets = await repositories.categoryGroups.create({ name: 'Projets' })
    const loisirs = await repositories.categoryGroups.create({ name: 'Loisirs' })

    await repositories.categoryGroups.reorder([loisirs.id, matieres.id, projets.id])

    const groups = await repositories.categoryGroups.list()
    const orderById = new Map(groups.map((group) => [group.id, group.order]))

    expect(orderById.get(loisirs.id)).toBe(0)
    expect(orderById.get(matieres.id)).toBe(1)
    expect(orderById.get(projets.id)).toBe(2)
  })

  it('refuse un réordonnancement de groupes contenant un doublon', async () => {
    const group = await repositories.categoryGroups.create({ name: 'Matières' })

    await expect(repositories.categoryGroups.reorder([group.id, group.id])).rejects.toBeInstanceOf(
      RangeError
    )
  })
})

describe('réglages', () => {
  it('crée puis met à jour une valeur existante', async () => {
    const created = await repositories.settings.setValue('categories.onboardingCompleted', false)
    const updated = await repositories.settings.setValue('categories.onboardingCompleted', true)

    expect(updated.id).toBe(created.id)
    expect(updated.value).toBe(true)
    expect((await repositories.settings.getByKey('categories.onboardingCompleted'))?.value).toBe(
      true
    )
  })
})
