import { DEFAULT_ITEM_TYPE_IDS } from '../core/itemTypes'
import type { Category, Item, LocalDate } from '../core/types'
import type { Repositories } from './repositories'

/** Semaine reproduite par la commande de démonstration. */
export const DEMO_WEEK_START: LocalDate = '2026-11-09'

/** Réglage évitant de dupliquer les données de démonstration. */
export const DEMO_WEEK_LOADED_SETTING_KEY = 'dev.demoWeek.loadedAt'

export interface DemoWeekResult {
  weekStart: LocalDate
  alreadyLoaded: boolean
}

interface DemoCategory {
  name: string
  color: string
}

const DEMO_CATEGORIES: readonly DemoCategory[] = [
  { name: 'Maths', color: '#3E63DD' },
  { name: 'Info', color: '#6E56CF' },
  { name: 'Physique', color: '#12A594' },
  { name: 'Anglais', color: '#F2730D' },
  { name: 'Projet', color: '#30A46C' }
]

interface DemoItemInput {
  typeId: string
  title: string
  categoryId?: string | null
  estimateMin?: number | null
}

/**
 * Charge une semaine de démonstration fidèle à la maquette. Toutes les
 * écritures passent par les repositories. L'opération n'est faite qu'une fois :
 * un réglage mémorise son exécution pour ne pas dupliquer les données.
 */
export async function loadDemoWeek(repositories: Repositories): Promise<DemoWeekResult> {
  const marker = await repositories.settings.getByKey(DEMO_WEEK_LOADED_SETTING_KEY)

  if (marker !== undefined) {
    return { weekStart: DEMO_WEEK_START, alreadyLoaded: true }
  }

  const categories = await ensureCategories(repositories)
  const items = new Map<string, Item>()

  const addItem = async (key: string, input: DemoItemInput): Promise<Item> => {
    const item = await repositories.items.create({
      typeId: input.typeId,
      title: input.title,
      categoryId: input.categoryId ?? null,
      estimateMin: input.estimateMin ?? null
    })
    items.set(key, item)
    return item
  }

  const place = async (
    itemKey: string,
    date: LocalDate,
    startMin: number | null,
    durationMin: number
  ): Promise<void> => {
    const item = items.get(itemKey)

    if (item === undefined) {
      throw new Error(`Élément de démonstration introuvable : ${itemKey}`)
    }

    await repositories.blocks.create({
      itemId: item.id,
      date,
      startMin,
      durationMin
    })
  }

  const categoryId = (name: string): string | null => categories.get(name)?.id ?? null

  await addItem('petitDej', { typeId: DEFAULT_ITEM_TYPE_IDS.fixed, title: 'Petit-déj' })
  await addItem('cours', { typeId: DEFAULT_ITEM_TYPE_IDS.fixed, title: 'Cours' })
  await addItem('dejeuner', { typeId: DEFAULT_ITEM_TYPE_IDS.fixed, title: 'Déjeuner' })
  await addItem('diner', { typeId: DEFAULT_ITEM_TYPE_IDS.fixed, title: 'Dîner' })

  await addItem('exosInfo', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Exos Info',
    categoryId: categoryId('Info'),
    estimateMin: 60
  })
  await addItem('dmMaths', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'DM Maths n°4',
    categoryId: categoryId('Maths'),
    estimateMin: 240
  })
  await addItem('coursPhysique', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Cours Physique',
    categoryId: categoryId('Physique'),
    estimateMin: 60
  })
  await addItem('anglaisVocab', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Anglais : vocabulaire',
    categoryId: categoryId('Anglais'),
    estimateMin: 30
  })
  await addItem('revisionsMaths', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Révisions DS Maths',
    categoryId: categoryId('Maths'),
    estimateMin: 195
  })
  await addItem('projetPlanner', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Projet planner',
    categoryId: categoryId('Projet'),
    estimateMin: 120
  })

  await addItem('dsMaths', {
    typeId: DEFAULT_ITEM_TYPE_IDS.exam,
    title: 'DS Maths',
    categoryId: categoryId('Maths')
  })
  await addItem('khollePhysique', {
    typeId: DEFAULT_ITEM_TYPE_IDS.exam,
    title: 'Khôlle Physique',
    categoryId: categoryId('Physique')
  })
  await addItem('evalAnglais', {
    typeId: DEFAULT_ITEM_TYPE_IDS.exam,
    title: 'Éval. Anglais',
    categoryId: categoryId('Anglais')
  })

  await addItem('sport', { typeId: DEFAULT_ITEM_TYPE_IDS.free, title: 'Sport' })
  await addItem('tempsLibre', { typeId: DEFAULT_ITEM_TYPE_IDS.free, title: 'Temps libre' })

  await addItem('feuilleExercices', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Feuille d’exercices n°7',
    categoryId: categoryId('Maths'),
    estimateMin: 60
  })
  await addItem('tpOcaml', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'TP OCaml',
    categoryId: categoryId('Info'),
    estimateMin: 90
  })
  await addItem('ficheChapitre', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Fiche chapitre 5',
    categoryId: categoryId('Physique'),
    estimateMin: 45
  })
  await addItem('syntheseAnglais', {
    typeId: DEFAULT_ITEM_TYPE_IDS.task,
    title: 'Synthèse d’anglais',
    categoryId: categoryId('Anglais'),
    estimateMin: 45
  })

  // Lundi 9 novembre.
  await place('petitDej', '2026-11-09', 7 * 60, 60)
  await place('cours', '2026-11-09', 8 * 60, 240)
  await place('dejeuner', '2026-11-09', 12 * 60, 60)
  await place('cours', '2026-11-09', 13 * 60, 240)
  await place('exosInfo', '2026-11-09', 17 * 60 + 15, 60)
  await place('diner', '2026-11-09', 19 * 60 + 30, 30)

  // Mardi 10 novembre.
  await place('petitDej', '2026-11-10', 7 * 60, 60)
  await place('cours', '2026-11-10', 8 * 60, 240)
  await place('dejeuner', '2026-11-10', 12 * 60, 60)
  await place('cours', '2026-11-10', 13 * 60, 240)
  await place('dmMaths', '2026-11-10', 17 * 60 + 30, 60)
  await place('coursPhysique', '2026-11-10', 18 * 60 + 30, 60)
  await place('diner', '2026-11-10', 19 * 60 + 30, 30)
  await place('sport', '2026-11-10', 20 * 60 + 30, 60)

  // Mercredi 11 novembre.
  await place('petitDej', '2026-11-11', 7 * 60, 60)
  await place('cours', '2026-11-11', 8 * 60, 240)
  await place('dejeuner', '2026-11-11', 12 * 60, 60)
  await place('dmMaths', '2026-11-11', 14 * 60, 120)
  await place('anglaisVocab', '2026-11-11', 16 * 60 + 45, 30)
  await place('sport', '2026-11-11', 17 * 60 + 30, 60)
  await place('diner', '2026-11-11', 19 * 60 + 30, 30)

  // Jeudi 12 novembre.
  await place('petitDej', '2026-11-12', 7 * 60, 60)
  await place('cours', '2026-11-12', 8 * 60, 240)
  await place('dejeuner', '2026-11-12', 12 * 60, 60)
  await place('cours', '2026-11-12', 13 * 60, 240)
  await place('khollePhysique', '2026-11-12', 18 * 60, 60)
  await place('diner', '2026-11-12', 19 * 60 + 30, 30)
  await place('tempsLibre', '2026-11-12', 20 * 60 + 30, 90)
  await place('evalAnglais', '2026-11-12', null, 60)

  // Vendredi 13 novembre.
  await place('petitDej', '2026-11-13', 7 * 60, 60)
  await place('cours', '2026-11-13', 8 * 60, 240)
  await place('dejeuner', '2026-11-13', 12 * 60, 60)
  await place('cours', '2026-11-13', 13 * 60, 180)
  await place('revisionsMaths', '2026-11-13', 17 * 60 + 15, 75)
  await place('diner', '2026-11-13', 19 * 60 + 30, 30)

  // Samedi 14 novembre.
  await place('petitDej', '2026-11-14', 7 * 60 + 30, 30)
  await place('dsMaths', '2026-11-14', 8 * 60, 240)
  await place('dejeuner', '2026-11-14', 12 * 60, 60)
  await place('revisionsMaths', '2026-11-14', 14 * 60, 120)
  await place('sport', '2026-11-14', 16 * 60 + 30, 90)
  await place('diner', '2026-11-14', 19 * 60 + 30, 30)

  // Dimanche 15 novembre.
  await place('petitDej', '2026-11-15', 8 * 60, 60)
  await place('projetPlanner', '2026-11-15', 10 * 60, 120)
  await place('dejeuner', '2026-11-15', 12 * 60, 60)
  await place('diner', '2026-11-15', 19 * 60 + 30, 30)

  await repositories.settings.setValue(DEMO_WEEK_LOADED_SETTING_KEY, new Date().toISOString())

  return { weekStart: DEMO_WEEK_START, alreadyLoaded: false }
}

async function ensureCategories(repositories: Repositories): Promise<Map<string, Category>> {
  const [groups, existingCategories] = await Promise.all([
    repositories.categoryGroups.list(),
    repositories.categories.listActive()
  ])

  const group = groups.find((candidate) => candidate.name === 'Matières')

  let categoryGroupId: string | null = group?.id ?? null

  if (categoryGroupId === null) {
    const createdGroup = await repositories.categoryGroups.create({ name: 'Matières' })
    categoryGroupId = createdGroup.id
  }

  const byName = new Map<string, Category>(
    existingCategories.map((category) => [category.name.toLocaleLowerCase('fr-FR'), category])
  )

  for (const category of DEMO_CATEGORIES) {
    const key = category.name.toLocaleLowerCase('fr-FR')

    if (byName.has(key)) continue

    const created = await repositories.categories.create({
      name: category.name,
      color: category.color,
      groupId: categoryGroupId
    })
    byName.set(key, created)
  }

  return new Map(
    DEMO_CATEGORIES.flatMap((category) => {
      const found = byName.get(category.name.toLocaleLowerCase('fr-FR'))
      return found === undefined ? [] : [[category.name, found] as const]
    })
  )
}
