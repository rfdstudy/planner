import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import {
  BACKUP_FORMAT,
  BackupFormatError,
  backupFileName,
  createBackup,
  importBackup,
  parseBackup,
  serializeBackup
} from '../src/db/backup'
import { DATABASE_VERSION, PlannerDatabase } from '../src/db/database'
import { createRepositories, type Repositories } from '../src/db/repositories'

let database: PlannerDatabase
let repositories: Repositories
let databaseSequence = 0

beforeEach(() => {
  databaseSequence += 1
  database = new PlannerDatabase(`planner-backup-test-${databaseSequence}`)
  repositories = createRepositories(database)
})

afterEach(async () => {
  await database.delete()
})

describe('sauvegarde JSON', () => {
  it('exporte toutes les tables, y compris les enregistrements supprimés', async () => {
    const group = await repositories.categoryGroups.create({ name: 'Matières', order: 0 })
    const category = await repositories.categories.create({
      name: 'Maths',
      color: '#3E63DD',
      groupId: group.id
    })
    const item = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Réviser',
      categoryId: category.id
    })
    const block = await repositories.blocks.create({
      itemId: item.id,
      date: '2026-11-12',
      startMin: 540,
      durationMin: 60
    })
    const template = await repositories.templates.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
      title: 'Cours',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMin: 480,
      durationMin: 120,
      validFrom: '2026-11-02'
    })
    await repositories.overrides.create({
      templateId: template.id,
      date: '2026-11-09',
      action: 'skip'
    })
    await repositories.settings.create({ key: 'theme', value: 'light' })
    await repositories.blocks.softDelete(block.id)

    const backup = await createBackup(repositories, new Date('2026-11-11T20:00:00.000Z'))

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(DATABASE_VERSION)
    expect(backup.exportedAt).toBe('2026-11-11T20:00:00.000Z')
    expect(backup.data.categoryGroups).toHaveLength(1)
    expect(backup.data.categories).toHaveLength(1)
    expect(backup.data.itemTypes).toHaveLength(5)
    expect(backup.data.items).toHaveLength(1)
    expect(backup.data.blocks).toHaveLength(1)
    expect(backup.data.blocks[0]?.deletedAt).not.toBeNull()
    expect(backup.data.templates).toHaveLength(1)
    expect(backup.data.overrides).toHaveLength(1)
    expect(backup.data.settings.some((setting) => setting.key === 'theme')).toBe(true)
  })

  it('produit un JSON relisible et un nom de fichier daté', async () => {
    const backup = await createBackup(repositories, new Date('2026-11-11T20:00:00.000Z'))
    const serialized = serializeBackup(backup)

    expect(JSON.parse(serialized)).toEqual(backup)
    expect(backupFileName(new Date(2026, 10, 11, 20, 0))).toBe('planner-sauvegarde-2026-11-11.json')
  })

  it('relit une sauvegarde exportée sans perte', async () => {
    await repositories.categories.create({ name: 'Maths', color: '#3E63DD', groupId: null })
    await repositories.settings.create({ key: 'theme', value: 'light' })
    const backup = await createBackup(repositories, new Date('2026-11-11T20:00:00.000Z'))

    expect(parseBackup(serializeBackup(backup))).toEqual(backup)
  })

  it('refuse un JSON invalide, un autre format et une version inconnue', () => {
    expect(() => parseBackup('{')).toThrow(BackupFormatError)
    expect(() => parseBackup('{"format":"autre"}')).toThrow(/pas une sauvegarde Planner/)
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: DATABASE_VERSION + 1,
          exportedAt: '2026-11-11T20:00:00.000Z',
          data: {}
        })
      )
    ).toThrow(/Version de sauvegarde non prise en charge/)
  })

  it('refuse une table absente ou une entrée invalide', async () => {
    const backup = await createBackup(repositories)
    const serialized = JSON.parse(serializeBackup(backup)) as {
      data: { blocks: unknown[]; items: unknown[] }
    }

    serialized.data.blocks.push({ id: 'bloc-invalide' })
    expect(() => parseBackup(JSON.stringify(serialized))).toThrow(/Entrée invalide/)

    serialized.data.blocks.pop()
    delete (serialized.data as Partial<typeof serialized.data>).items
    expect(() => parseBackup(JSON.stringify(serialized))).toThrow(/absente ou invalide/)
  })

  it('remplace toutes les tables lors d’un import', async () => {
    const originalGroup = await repositories.categoryGroups.create({ name: 'Matières', order: 0 })
    const originalCategory = await repositories.categories.create({
      name: 'Maths',
      color: '#3E63DD',
      groupId: originalGroup.id
    })
    const originalItem = await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Réviser',
      categoryId: originalCategory.id
    })
    await repositories.blocks.create({
      itemId: originalItem.id,
      date: '2026-11-12',
      startMin: 540,
      durationMin: 60
    })

    const backup = parseBackup(serializeBackup(await createBackup(repositories)))

    await repositories.categories.create({ name: 'À supprimer', color: '#E5484D' })
    await repositories.items.create({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Tâche en trop'
    })

    await importBackup(repositories, backup)

    expect(
      (await repositories.categories.list({ includeDeleted: true })).map((c) => c.name)
    ).toEqual(['Maths'])
    expect((await repositories.items.list({ includeDeleted: true })).map((i) => i.title)).toEqual([
      'Réviser'
    ])
    expect(await repositories.blocks.list({ includeDeleted: true })).toHaveLength(1)
    expect(repositories.history.size).toBe(0)
  })

  it('convertit une ancienne sauvegarde JSON (schéma 1) vers le nouveau schéma', async () => {
    const timestamp = '2026-11-01T10:00:00.000Z'
    const oldBackup = {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-11-11T20:00:00.000Z',
      data: {
        categoryGroups: [],
        categories: [],
        items: [
          {
            id: 'old-item',
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
            kind: 'task',
            title: 'Ancienne tâche',
            notes: '',
            categoryId: null,
            estimateMin: 60,
            status: 'todo',
            templateId: null
          }
        ],
        blocks: [
          {
            id: 'old-block',
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
            itemId: 'old-item',
            date: '2026-11-12',
            startMin: 540,
            durationMin: 60
          }
        ],
        templates: [
          {
            id: 'old-template',
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
            kind: 'free',
            title: 'Ancien modèle',
            categoryId: null,
            rrule: 'FREQ=WEEKLY;BYDAY=MO',
            startMin: 480,
            durationMin: 60,
            validFrom: '2026-11-02',
            validUntil: null
          }
        ],
        overrides: [],
        settings: []
      }
    }

    const parsed = parseBackup(JSON.stringify(oldBackup))

    expect(parsed.version).toBe(DATABASE_VERSION)
    expect(parsed.data.itemTypes).toHaveLength(5)
    expect(parsed.data.items[0]).toMatchObject({
      typeId: DEFAULT_ITEM_TYPE_IDS.task,
      title: 'Ancienne tâche'
    })
    expect(parsed.data.items[0]).not.toHaveProperty('kind')
    expect(parsed.data.templates[0]).toMatchObject({
      typeId: DEFAULT_ITEM_TYPE_IDS.free,
      title: 'Ancien modèle'
    })
    expect(parsed.data.templates[0]).not.toHaveProperty('kind')

    await importBackup(repositories, parsed)

    expect((await repositories.items.list())[0]?.typeId).toBe(DEFAULT_ITEM_TYPE_IDS.task)
    expect(await repositories.itemTypes.list()).toHaveLength(5)
    expect((await repositories.blocks.list())[0]?.itemId).toBe('old-item')
  })
})
