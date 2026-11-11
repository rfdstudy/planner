import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_SETTING_KEYS,
  normalizePreferences,
  preferencesFromSettings
} from '../src/core/preferences'

describe('réglages personnels', () => {
  it('applique les valeurs par défaut aux champs absents ou invalides', () => {
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES)
    expect(
      normalizePreferences({
        weekStartsOn: 9,
        defaultTaskDurationMin: 17,
        dragStepMin: -5
      })
    ).toEqual(DEFAULT_PREFERENCES)
  })

  it('accepte les valeurs proposées par l’interface', () => {
    expect(
      normalizePreferences({
        weekStartsOn: 6,
        defaultTaskDurationMin: 90,
        dragStepMin: 30
      })
    ).toEqual({
      weekStartsOn: 6,
      defaultTaskDurationMin: 90,
      dragStepMin: 30
    })
  })

  it('lit les clés de réglage et ignore les autres', () => {
    expect(
      preferencesFromSettings([
        { key: PREFERENCE_SETTING_KEYS.weekStartsOn, value: 6 },
        { key: PREFERENCE_SETTING_KEYS.defaultTaskDurationMin, value: 45 },
        { key: PREFERENCE_SETTING_KEYS.dragStepMin, value: 10 },
        { key: 'theme', value: 'light' }
      ])
    ).toEqual({
      weekStartsOn: 6,
      defaultTaskDurationMin: 45,
      dragStepMin: 10
    })
  })

  it('revient aux défauts quand une valeur stockée est illisible', () => {
    expect(
      preferencesFromSettings([
        { key: PREFERENCE_SETTING_KEYS.weekStartsOn, value: 'lundi' },
        { key: PREFERENCE_SETTING_KEYS.defaultTaskDurationMin, value: null },
        { key: PREFERENCE_SETTING_KEYS.dragStepMin, value: 14 }
      ])
    ).toEqual({
      weekStartsOn: 0,
      defaultTaskDurationMin: 60,
      dragStepMin: 15
    })
  })
})
