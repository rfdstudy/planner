import { describe, expect, it } from 'vitest'
import {
  AUTO_BACKUP_KEEP,
  autoBackupFileName,
  isAutoBackupFileName,
  selectAutoBackupsToDelete
} from '../src/core/backupRetention'

describe('rotation des sauvegardes automatiques', () => {
  it('nomme les copies de façon chronologique', () => {
    expect(autoBackupFileName(new Date('2026-11-11T20:05:09.123Z'))).toBe(
      'planner-auto-2026-11-11T20-05-09-123Z.json'
    )
    expect(isAutoBackupFileName('planner-auto-2026-11-11T20-05-09-123Z.json')).toBe(true)
    expect(isAutoBackupFileName('planner-sauvegarde-2026-11-11.json')).toBe(false)
    expect(isAutoBackupFileName('planner-auto-manuel.txt')).toBe(false)
  })

  it('conserve les cinq copies les plus récentes et ignore les autres fichiers', () => {
    const names = [
      'planner-auto-2026-11-11T20-05-00-000Z.json',
      'planner-auto-2026-11-11T20-04-00-000Z.json',
      'planner-auto-2026-11-11T20-03-00-000Z.json',
      'planner-auto-2026-11-11T20-02-00-000Z.json',
      'planner-auto-2026-11-11T20-01-00-000Z.json',
      'planner-auto-2026-11-11T20-00-00-000Z.json',
      'planner-auto-2026-11-11T19-59-00-000Z.json',
      'planner-sauvegarde-manuelle.json'
    ]

    expect(selectAutoBackupsToDelete(names)).toEqual([
      'planner-auto-2026-11-11T20-00-00-000Z.json',
      'planner-auto-2026-11-11T19-59-00-000Z.json'
    ])
    expect(selectAutoBackupsToDelete(names)).toHaveLength(2)
    expect(AUTO_BACKUP_KEEP).toBe(5)
  })

  it('refuse un nombre de copies à conserver invalide', () => {
    expect(() => selectAutoBackupsToDelete([], 0)).toThrow(RangeError)
    expect(() => selectAutoBackupsToDelete([], 2.5)).toThrow(RangeError)
  })
})
