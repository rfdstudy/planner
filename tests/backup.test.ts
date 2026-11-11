import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, backupFileName, createBackup, serializeBackup } from '../src/db/backup'
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
      kind: 'task',
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
      kind: 'fixed',
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
    expect(backup.data.items).toHaveLength(1)
    expect(backup.data.blocks).toHaveLength(1)
    expect(backup.data.blocks[0]?.deletedAt).not.toBeNull()
    expect(backup.data.templates).toHaveLength(1)
    expect(backup.data.overrides).toHaveLength(1)
    expect(backup.data.settings).toHaveLength(1)
  })

  it('produit un JSON relisible et un nom de fichier daté', async () => {
    const backup = await createBackup(repositories, new Date('2026-11-11T20:00:00.000Z'))
    const serialized = serializeBackup(backup)

    expect(JSON.parse(serialized)).toEqual(backup)
    expect(backupFileName(new Date(2026, 10, 11, 20, 0))).toBe('planner-sauvegarde-2026-11-11.json')
  })
})
