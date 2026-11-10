import { db, type PlannerDatabase } from '../database'
import { BlockRepository } from './blocks'
import { CategoryGroupRepository } from './categoryGroups'
import { CategoryRepository } from './categories'
import { ItemRepository } from './items'
import { OverrideRepository } from './overrides'
import { SettingRepository } from './settings'
import { TemplateRepository } from './templates'

export interface Repositories {
  categoryGroups: CategoryGroupRepository
  categories: CategoryRepository
  items: ItemRepository
  blocks: BlockRepository
  templates: TemplateRepository
  overrides: OverrideRepository
  settings: SettingRepository
}

/** Construit les repositories pour une base donnée (utile aux tests). */
export function createRepositories(database: PlannerDatabase): Repositories {
  return {
    categoryGroups: new CategoryGroupRepository(database.categoryGroups),
    categories: new CategoryRepository(database),
    items: new ItemRepository(database.items),
    blocks: new BlockRepository(database.blocks),
    templates: new TemplateRepository(database.templates),
    overrides: new OverrideRepository(database.overrides),
    settings: new SettingRepository(database.settings)
  }
}

export { RecordDeletedError, RecordNotFoundError } from './base'
export type { EntityData, EntityPatch, ReadOptions } from './base'

/** Repositories de la base applicative. */
export const repositories = createRepositories(db)
