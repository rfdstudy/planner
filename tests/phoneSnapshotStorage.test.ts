import { describe, expect, it } from 'vitest'
import { createPhoneSnapshot, serializePhoneSnapshot } from '../src/core/phoneSnapshot'
import {
  PhoneSnapshotError,
  formatPhoneSnapshotMoment,
  isPhoneSnapshotStale,
  parsePhoneSnapshot
} from '../src/phone/storage'

const snapshot = createPhoneSnapshot({
  today: '2026-11-12',
  generatedAt: '2026-11-12T20:15:00.000Z',
  categories: [],
  itemTypes: [],
  items: [],
  blocks: [],
  templates: [],
  overrides: []
})

describe('lecture de l’instantané sur le téléphone', () => {
  it('relit un instantané produit par le PC', () => {
    expect(parsePhoneSnapshot(serializePhoneSnapshot(snapshot))).toEqual(snapshot)
  })

  it('refuse un numéro de version inconnu', () => {
    const value = JSON.parse(serializePhoneSnapshot(snapshot))
    value.snapshotVersion = 99

    expect(() => parsePhoneSnapshot(JSON.stringify(value))).toThrow(PhoneSnapshotError)
    expect(() => parsePhoneSnapshot('{"snapshotVersion":1}')).toThrow(PhoneSnapshotError)
    expect(() => parsePhoneSnapshot('pas du json')).toThrow(PhoneSnapshotError)
  })

  it('signale un instantané de plus de 24 heures', () => {
    const now = new Date('2026-11-14T21:00:00.000Z')

    expect(isPhoneSnapshotStale(snapshot, now)).toBe(true)
    expect(isPhoneSnapshotStale(snapshot, new Date('2026-11-13T18:00:00.000Z'))).toBe(false)
  })

  it('formate la date de génération à la française', () => {
    expect(formatPhoneSnapshotMoment('2026-11-12T20:15:00')).toBe('12 nov. à 20:15')
  })
})
