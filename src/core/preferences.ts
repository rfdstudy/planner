import type { JsonValue } from './types'

/**
 * Réglages personnels de l'application. Ils sont stockés comme des `Setting`
 * ordinaires afin de suivre les mêmes règles de sauvegarde que les données.
 */
export interface Preferences {
  /** Index français du premier jour : 0 = lundi, 6 = dimanche. */
  weekStartsOn: number
  /** Durée proposée pour une tâche sans estimation. */
  defaultTaskDurationMin: number
  /** Pas d'accrochage du glisser-déposer, en minutes. */
  dragStepMin: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  weekStartsOn: 0,
  defaultTaskDurationMin: 60,
  dragStepMin: 15
}

export const PREFERENCE_SETTING_KEYS: Readonly<Record<keyof Preferences, string>> = {
  weekStartsOn: 'preferences.weekStartsOn',
  defaultTaskDurationMin: 'preferences.defaultTaskDurationMin',
  dragStepMin: 'preferences.dragStepMin'
}

/** Libellés des jours, dans l'ordre attendu par les réglages. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Lundi' },
  { value: 1, label: 'Mardi' },
  { value: 2, label: 'Mercredi' },
  { value: 3, label: 'Jeudi' },
  { value: 4, label: 'Vendredi' },
  { value: 5, label: 'Samedi' },
  { value: 6, label: 'Dimanche' }
]

export const TASK_DURATION_OPTIONS: readonly number[] = [15, 30, 45, 60, 90, 120]

export const DRAG_STEP_OPTIONS: readonly number[] = [5, 10, 15, 20, 30, 60]

function isAllowedNumber(value: unknown, options: readonly number[]): value is number {
  return typeof value === 'number' && options.includes(value)
}

/** Ramène une valeur quelconque dans les réglages connus, sans jamais échouer. */
export function normalizePreferences(
  values: Partial<Record<keyof Preferences, unknown>>
): Preferences {
  return {
    weekStartsOn:
      typeof values.weekStartsOn === 'number' &&
      Number.isInteger(values.weekStartsOn) &&
      values.weekStartsOn >= 0 &&
      values.weekStartsOn <= 6
        ? values.weekStartsOn
        : DEFAULT_PREFERENCES.weekStartsOn,
    defaultTaskDurationMin: isAllowedNumber(values.defaultTaskDurationMin, TASK_DURATION_OPTIONS)
      ? values.defaultTaskDurationMin
      : DEFAULT_PREFERENCES.defaultTaskDurationMin,
    dragStepMin: isAllowedNumber(values.dragStepMin, DRAG_STEP_OPTIONS)
      ? values.dragStepMin
      : DEFAULT_PREFERENCES.dragStepMin
  }
}

/** Extrait les réglages d'une liste de `Setting`, en ignorant les clés inconnues. */
export function preferencesFromSettings(
  settings: ReadonlyArray<{ key: string; value: JsonValue }>
): Preferences {
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]))

  return normalizePreferences({
    weekStartsOn: byKey.get(PREFERENCE_SETTING_KEYS.weekStartsOn),
    defaultTaskDurationMin: byKey.get(PREFERENCE_SETTING_KEYS.defaultTaskDurationMin),
    dragStepMin: byKey.get(PREFERENCE_SETTING_KEYS.dragStepMin)
  })
}
