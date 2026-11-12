import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listInboxTasks } from '../src/core/inbox'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import { PlannerDatabase } from '../src/db/database'
import { createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

const NOTES = 'Introduction\n- [x] Exercice 1\n- [X] Exercice 2\n- [ ] Exercice 3'

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-duplicate-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

async function createTask(
  overrides: {
    title?: string
    estimateMin?: number | null
    notes?: string
    templateId?: string | null
  } = {}
): Promise<{ itemId: string; blockId: string }> {
  const item = await repositories.items.create({
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: overrides.title ?? 'Révisions',
    notes: overrides.notes ?? NOTES,
    estimateMin: overrides.estimateMin ?? 120,
    templateId: overrides.templateId ?? null
  })
  const block = await repositories.blocks.create({
    itemId: item.id,
    date: '2026-11-12',
    startMin: 600,
    durationMin: 60
  })

  return { itemId: item.id, blockId: block.id }
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

describe('duplication d’un élément', () => {
  it('crée un nouvel identifiant et laisse l’original intact', async () => {
    const source = await createTask()
    await repositories.items.setTaskStatus(source.itemId, 'done')
    await repositories.elements.create({
      item: {
        typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
        title: 'Déjeuner',
        notes: '',
        categoryId: null,
        estimateMin: null,
        status: null
      },
      block: { date: '2026-11-12', startMin: 660, durationMin: 60 }
    })

    const originalItem = await repositories.items.get(source.itemId)
    const originalBlock = await repositories.blocks.get(source.blockId)

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: source.itemId,
      blockId: source.blockId
    })

    expect(copy.item.id).not.toBe(source.itemId)
    expect(copy.block?.id).not.toBe(source.blockId)
    expect(copy.item.title).toBe('Révisions')
    expect(copy.item.typeId).toBe(DEFAULT_ITEM_TYPE_IDS.task)
    expect(copy.item.estimateMin).toBe(120)
    expect(copy.item.status).toBe('todo')
    expect(copy.item.templateId).toBeNull()
    expect(copy.block).toMatchObject({
      date: '2026-11-12',
      startMin: 720,
      durationMin: 60,
      endDate: null
    })

    expect(await repositories.items.get(source.itemId)).toEqual(originalItem)
    expect(await repositories.blocks.get(source.blockId)).toEqual(originalBlock)
    expect((await repositories.items.get(source.itemId))?.status).toBe('done')
  })

  it('démarre la copie à faire et décoche les cases des notes', async () => {
    const source = await createTask()
    await repositories.items.setTaskStatus(source.itemId, 'done')

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: source.itemId,
      blockId: source.blockId
    })

    expect(copy.item.status).toBe('todo')
    expect(copy.item.notes).toBe(
      'Introduction\n- [ ] Exercice 1\n- [ ] Exercice 2\n- [ ] Exercice 3'
    )
    expect((await repositories.items.get(source.itemId))?.notes).toBe(NOTES)
  })

  it('place la copie au premier créneau libre après l’original', async () => {
    const source = await createTask()
    await repositories.elements.create({
      item: {
        typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
        title: 'Cours',
        notes: '',
        categoryId: null,
        estimateMin: null,
        status: null
      },
      block: { date: '2026-11-12', startMin: 660, durationMin: 60 }
    })

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: source.itemId,
      blockId: source.blockId
    })

    // 10 h - 11 h est occupé par l'original, 11 h - 12 h par le cours :
    // la première place libre après l'original commence à 12 h.
    expect(copy.block?.startMin).toBe(720)
  })

  it('tient compte des occurrences virtuelles de la semaine type', async () => {
    const source = await createTask()
    await repositories.templates.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
      title: 'Cours de la semaine type',
      categoryId: null,
      rrule: 'FREQ=WEEKLY;BYDAY=TH',
      startMin: 660,
      durationMin: 60,
      validFrom: '2026-09-01',
      validUntil: null
    })

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: source.itemId,
      blockId: source.blockId
    })

    expect(copy.block?.startMin).toBe(720)
  })

  it('envoie une tâche dans « À planifier » quand la journée est pleine', async () => {
    const item = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Journée chargée',
      estimateMin: 60
    })
    await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: 0,
      durationMin: 1440
    })

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: item.id,
      blockId: (await repositories.blocks.listByItem(item.id))[0].id
    })

    expect(copy.block).toBeNull()
    expect(copy.item.estimateMin).toBe(60)
    expect(await inboxIds()).toEqual([copy.item.id])
  })

  it('laisse les autres types au même horaire quand aucun créneau n’est libre', async () => {
    const item = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
      title: 'Repas',
      estimateMin: null
    })
    const block = await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: 0,
      durationMin: 1440
    })

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: item.id,
      blockId: block.id
    })

    expect(copy.block).toMatchObject({
      date: '2026-11-12',
      startMin: 0,
      durationMin: 1440,
      endDate: null
    })
    expect(copy.item.status).toBeNull()
  })

  it('copie un élément issu d’un modèle en élément indépendant', async () => {
    const source = await createTask({ title: 'Cours du matin', templateId: 'modele-1' })

    const fromTemplate = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: source.itemId,
      blockId: source.blockId
    })

    expect(fromTemplate.item.templateId).toBeNull()
    expect((await repositories.items.get(source.itemId))?.templateId).toBe('modele-1')

    const fromOccurrence = await repositories.elements.duplicateItem({
      kind: 'snapshot',
      snapshot: {
        item: {
          typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
          title: 'Occurrence virtuelle',
          notes: '',
          categoryId: null,
          estimateMin: null
        },
        block: {
          date: '2026-11-13',
          startMin: 480,
          durationMin: 60,
          endDate: null
        }
      }
    })

    expect(fromOccurrence.item.title).toBe('Occurrence virtuelle')
    expect(fromOccurrence.item.templateId).toBeNull()
    expect(await repositories.items.get(fromOccurrence.item.id)).toEqual(fromOccurrence.item)
  })

  it('conserve la longueur d’un élément sur plusieurs jours', async () => {
    const item = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.event,
      title: 'Vacances',
      estimateMin: null
    })
    const block = await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: null,
      durationMin: 60,
      endDate: '2026-11-15'
    })

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: item.id,
      blockId: block.id
    })

    expect(copy.block).toMatchObject({
      date: '2026-11-12',
      startMin: null,
      endDate: '2026-11-15'
    })

    const moved = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: item.id,
      blockId: block.id,
      target: { date: '2026-11-20', startMin: 0 }
    })

    expect(moved.block).toMatchObject({
      date: '2026-11-20',
      startMin: null,
      endDate: '2026-11-23'
    })
  })

  it('copie un seul bloc d’une tâche à plusieurs blocs et en fait l’estimation', async () => {
    const item = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'DM de maths',
      estimateMin: 120
    })
    const firstBlock = await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: 600,
      durationMin: 45
    })
    await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: 780,
      durationMin: 30
    })

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: item.id,
      blockId: firstBlock.id
    })

    expect(copy.item.estimateMin).toBe(45)
    expect(copy.item.status).toBe('todo')
    expect(await repositories.blocks.listByItem(copy.item.id)).toHaveLength(1)
    expect(copy.block).toMatchObject({ startMin: 645, durationMin: 45 })
    expect(await repositories.blocks.listByItem(item.id)).toHaveLength(2)
  })

  it('colle à la destination demandée, accrochée sur quinze minutes', async () => {
    const source = await createTask()

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: source.itemId,
      blockId: source.blockId,
      target: { date: '2026-11-14', startMin: 607 },
      snapStepMin: 15
    })

    expect(copy.block).toMatchObject({
      date: '2026-11-14',
      startMin: 600,
      durationMin: 60,
      endDate: null
    })
    expect((await repositories.blocks.get(source.blockId))?.date).toBe('2026-11-12')
  })

  it('duplique une tâche du panneau sans lui donner de bloc', async () => {
    const item = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'À planifier',
      estimateMin: 45
    })

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: item.id,
      blockId: null
    })

    expect(copy.block).toBeNull()
    expect(copy.item.estimateMin).toBe(45)
    expect(await repositories.blocks.listByItem(copy.item.id)).toHaveLength(0)
    expect(await inboxIds()).toEqual(expect.arrayContaining([item.id, copy.item.id]))
  })

  it('annule la duplication en supprimant la copie et ses blocs', async () => {
    const source = await createTask()

    const copy = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: source.itemId,
      blockId: source.blockId
    })

    expect(repositories.history.size).toBe(1)

    await repositories.history.undo()

    expect(await repositories.items.get(copy.item.id)).toBeUndefined()
    expect(await repositories.blocks.get(copy.block?.id ?? '')).toBeUndefined()
    expect(await repositories.items.get(source.itemId)).toBeDefined()
    expect(repositories.history.size).toBe(0)
  })
})
