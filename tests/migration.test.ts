import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ITEM_TYPE_IDS, ITEM_TYPES_INITIALIZED_SETTING_KEY } from '../src/core/itemTypes'
import { DATABASE_VERSION, PlannerDatabase } from '../src/db/database'
import { createRepositories, type Repositories } from '../src/db/repositories'

const TIMESTAMP = '2026-11-01T10:00:00.000Z'

let databaseName: string
let databaseSequence = 0

beforeEach(() => {
  databaseSequence += 1
  databaseName = `planner-migration-test-${databaseSequence}`
})

afterEach(async () => {
  await Dexie.delete(databaseName)
})

async function createLegacyDatabase(): Promise<void> {
  const legacy = new Dexie(databaseName)

  legacy.version(1).stores({
    categoryGroups: 'id, order',
    categories: 'id, groupId, order, archivedAt',
    items: 'id, kind, categoryId, status, templateId',
    blocks: 'id, date, itemId, [date+startMin]',
    templates: 'id, kind, categoryId, validFrom',
    overrides: 'id, templateId, date, categoryId, [templateId+date]',
    settings: 'id, &key'
  })

  await legacy.open()

  await legacy.table('categoryGroups').put({
    id: 'group-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    name: 'Matières',
    order: 0
  })
  await legacy.table('categories').put({
    id: 'category-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    name: 'Maths',
    color: '#3E63DD',
    groupId: 'group-1',
    order: 0,
    archivedAt: null
  })
  await legacy.table('items').bulkPut([
    {
      id: 'item-task',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      deletedAt: null,
      kind: 'task',
      title: 'DM Maths',
      notes: '',
      categoryId: 'category-1',
      estimateMin: 60,
      status: 'todo',
      templateId: null
    },
    {
      id: 'item-exam',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      deletedAt: null,
      kind: 'exam',
      title: 'DS Maths',
      notes: '',
      categoryId: 'category-1',
      estimateMin: null,
      status: null,
      templateId: null
    },
    {
      id: 'item-deleted',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      deletedAt: '2026-11-02T10:00:00.000Z',
      kind: 'free',
      title: 'Ancien loisir',
      notes: '',
      categoryId: null,
      estimateMin: null,
      status: null,
      templateId: null
    }
  ])
  await legacy.table('blocks').put({
    id: 'block-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    itemId: 'item-task',
    date: '2026-11-12',
    startMin: 540,
    durationMin: 60
  })
  await legacy.table('templates').bulkPut([
    {
      id: 'template-fixed',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      deletedAt: null,
      kind: 'fixed',
      title: 'Cours',
      categoryId: null,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMin: 480,
      durationMin: 120,
      validFrom: '2026-11-02',
      validUntil: null
    },
    {
      id: 'template-free',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      deletedAt: null,
      kind: 'free',
      title: 'Sport',
      categoryId: null,
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
      startMin: 1080,
      durationMin: 60,
      validFrom: '2026-11-02',
      validUntil: null
    }
  ])
  await legacy.table('overrides').put({
    id: 'override-1',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    templateId: 'template-fixed',
    date: '2026-11-09',
    action: 'skip',
    title: null,
    categoryId: null,
    startMin: null,
    durationMin: null
  })
  await legacy.table('settings').put({
    id: 'setting-theme',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    key: 'theme',
    value: 'light'
  })

  legacy.close()
}

describe('migration Dexie du schéma historique', () => {
  it('crée les cinq types et rattache chaque élément sans perte', async () => {
    await createLegacyDatabase()

    const database = new PlannerDatabase(databaseName)
    const repositories: Repositories = createRepositories(database)

    const types = await repositories.itemTypes.list()
    const items = await repositories.items.list({ includeDeleted: true })
    const templates = await repositories.templates.list()
    const overrides = await repositories.overrides.list()
    const blocks = await repositories.blocks.list()
    const settings = await repositories.settings.list()

    expect(DATABASE_VERSION).toBe(2)
    expect(types.map((type) => type.name)).toEqual([
      'Tâche',
      'Fixe',
      'Épreuve',
      'Libre',
      'Événement'
    ])

    const typesByName = new Map(types.map((type) => [type.name, type]))
    expect(typesByName.get('Tâche')).toMatchObject({
      style: 'category',
      isTask: true,
      countdown: false,
      placement: 'grid',
      color: null
    })
    expect(typesByName.get('Fixe')).toMatchObject({
      style: 'neutral',
      isTask: false,
      countdown: false,
      placement: 'grid',
      color: null
    })
    expect(typesByName.get('Épreuve')).toMatchObject({
      style: 'alert',
      isTask: false,
      countdown: true,
      placement: 'topLine',
      color: null
    })
    expect(typesByName.get('Libre')).toMatchObject({
      style: 'free',
      isTask: false,
      countdown: false,
      placement: 'grid',
      color: null
    })
    expect(typesByName.get('Événement')).toMatchObject({
      style: 'neutral',
      isTask: false,
      countdown: false,
      placement: 'topLine',
      color: '#6E56CF'
    })
    expect(items).toHaveLength(3)
    expect(items.find((item) => item.id === 'item-task')?.typeId).toBe(DEFAULT_ITEM_TYPE_IDS.task)
    expect(items.find((item) => item.id === 'item-exam')?.typeId).toBe(DEFAULT_ITEM_TYPE_IDS.exam)
    expect(items.find((item) => item.id === 'item-deleted')?.typeId).toBe(
      DEFAULT_ITEM_TYPE_IDS.free
    )
    expect(items.find((item) => item.id === 'item-deleted')?.deletedAt).not.toBeNull()
    expect(items.every((item) => !('kind' in item))).toBe(true)

    expect(templates.find((template) => template.id === 'template-fixed')?.typeId).toBe(
      DEFAULT_ITEM_TYPE_IDS.fixed
    )
    expect(templates.find((template) => template.id === 'template-free')?.typeId).toBe(
      DEFAULT_ITEM_TYPE_IDS.free
    )
    expect(templates.every((template) => !('kind' in template))).toBe(true)

    expect(overrides[0]?.typeId).toBeNull()
    expect(blocks[0]).toMatchObject({ itemId: 'item-task', date: '2026-11-12' })
    expect(settings.some((setting) => setting.key === 'theme')).toBe(true)
    expect((await repositories.settings.getByKey(ITEM_TYPES_INITIALIZED_SETTING_KEY))?.value).toBe(
      true
    )

    await database.delete()
  })
})
