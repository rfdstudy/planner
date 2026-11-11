import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

describe('signal de mutation Dexie', () => {
  it('prévient la sauvegarde automatique après une écriture', async () => {
    const database = new Dexie('planner-auto-backup-event-test')
    database.version(1).stores({ records: 'id' })
    await database.open()

    let mutations = 0
    const listener = (): void => {
      mutations += 1
    }

    Dexie.on('storagemutated', listener)

    try {
      await database.table('records').add({ id: 'record-1' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mutations).toBeGreaterThan(0)
    } finally {
      Dexie.on('storagemutated').unsubscribe(listener)
      await database.delete()
    }
  })
})
