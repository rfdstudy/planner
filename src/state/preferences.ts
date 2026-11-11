import { create } from 'zustand'
import { DEFAULT_PREFERENCES, type Preferences } from '../core/preferences'

interface PreferencesState {
  preferences: Preferences
  setPreferences: (preferences: Preferences) => void
  setPreference: <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) => void
}

/**
 * Réglages chargés au démarrage. Ce store ne persiste rien : les écritures
 * passent par le repository des réglages, puis l'état est mis à jour.
 */
export const usePreferencesStore = create<PreferencesState>((set) => ({
  preferences: DEFAULT_PREFERENCES,
  setPreferences: (preferences) => set({ preferences }),
  setPreference: (key, value) =>
    set((state) => ({ preferences: { ...state.preferences, [key]: value } }))
}))
