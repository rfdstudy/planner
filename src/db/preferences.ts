import {
  PREFERENCE_SETTING_KEYS,
  preferencesFromSettings,
  type Preferences
} from '../core/preferences'
import type { JsonValue } from '../core/types'
import type { Repositories } from './repositories'

/** Charge les réglages personnels ; les valeurs absentes prennent leur défaut. */
export async function loadPreferences(repositories: Repositories): Promise<Preferences> {
  const settings = await repositories.settings.list()
  return preferencesFromSettings(settings)
}

/** Enregistre un réglage unique via le repository des réglages. */
export async function savePreference(
  repositories: Repositories,
  key: keyof Preferences,
  value: JsonValue
): Promise<void> {
  await repositories.settings.setValue(PREFERENCE_SETTING_KEYS[key], value)
}
