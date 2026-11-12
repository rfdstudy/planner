import { ITEM_TYPES_INITIALIZED_SETTING_KEY } from '../core/itemTypes'
import type { Repositories } from './repositories'

/** Réglage retenant que l'écran de bienvenue a été vu (ou passé). */
export const ONBOARDING_COMPLETED_SETTING_KEY = 'categories.onboardingCompleted'

/** Réglage évitant de recréer les groupes par défaut après leur suppression. */
export const GROUPS_INITIALIZED_SETTING_KEY = 'categories.groupsInitialized'

/** Groupes présents au tout premier lancement, avant toute personnalisation. */
export const INITIAL_CATEGORY_GROUP_NAMES = ['Matières', 'Projets'] as const

export interface ApplicationStartup {
  /** Vrai tant que l'utilisateur n'a ni validé ni passé l'écran de bienvenue. */
  firstLaunch: boolean
}

export interface OnboardingCategoryInput {
  name: string
  color: string
  groupId: string | null
}

const startupTasks = new WeakMap<Repositories, Promise<ApplicationStartup>>()

/**
 * Prépare la base au démarrage : crée les deux groupes de départ la première
 * fois, puis indique si l'écran de bienvenue doit être affiché. Les appels
 * simultanés (React StrictMode) partagent la même tâche.
 */
export function prepareApplication(repositories: Repositories): Promise<ApplicationStartup> {
  const existing = startupTasks.get(repositories)

  if (existing !== undefined) return existing

  const task = initializeApplication(repositories)
  startupTasks.set(repositories, task)
  void task.catch(() => startupTasks.delete(repositories))

  return task
}

/**
 * Enregistre les catégories choisies pendant l'accueil, puis marque l'étape
 * comme terminée. Un tableau vide correspond au bouton « Passer cette étape ».
 */
export async function finishOnboarding(
  repositories: Repositories,
  categories: readonly OnboardingCategoryInput[]
): Promise<void> {
  for (const category of categories) {
    await repositories.categories.create(category)
  }

  await repositories.settings.setValue(ONBOARDING_COMPLETED_SETTING_KEY, true)
  startupTasks.delete(repositories)
}

async function initializeApplication(repositories: Repositories): Promise<ApplicationStartup> {
  const typesInitialized = await repositories.settings.getByKey(ITEM_TYPES_INITIALIZED_SETTING_KEY)

  if (typesInitialized === undefined) {
    await repositories.itemTypes.ensureDefaults()
    await repositories.settings.setValue(ITEM_TYPES_INITIALIZED_SETTING_KEY, true)
  }

  const groupsInitialized = await repositories.settings.getByKey(GROUPS_INITIALIZED_SETTING_KEY)

  if (groupsInitialized === undefined) {
    const existingGroups = await repositories.categoryGroups.list({ includeDeleted: true })

    if (existingGroups.length === 0) {
      for (const [order, name] of INITIAL_CATEGORY_GROUP_NAMES.entries()) {
        await repositories.categoryGroups.create({ name, order })
      }
    }

    await repositories.settings.setValue(GROUPS_INITIALIZED_SETTING_KEY, true)
  }

  const onboardingCompleted = await repositories.settings.getByKey(ONBOARDING_COMPLETED_SETTING_KEY)

  return { firstLaunch: onboardingCompleted === undefined }
}
