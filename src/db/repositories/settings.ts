import type { Table } from 'dexie'
import type { JsonValue, Setting } from '../../core/types'
import { BaseRepository, type ReadOptions } from './base'

export interface CreateSettingInput {
  key: string
  value: JsonValue
}

export class SettingRepository extends BaseRepository<Setting> {
  constructor(table: Table<Setting, string>) {
    super(table, 'Réglage')
  }

  async create(input: CreateSettingInput): Promise<Setting> {
    return this.insert({
      key: input.key,
      value: input.value
    })
  }

  /** Lecture par clé, via l'index unique sur `key`. */
  async getByKey(key: string, options: ReadOptions = {}): Promise<Setting | undefined> {
    const setting = await this.table.where('key').equals(key).first()

    if (setting === undefined) return undefined
    if (!options.includeDeleted && setting.deletedAt !== null) return undefined

    return setting
  }

  /** Crée ou met à jour le réglage associé à une clé. */
  async setValue(key: string, value: JsonValue): Promise<Setting> {
    const existing = await this.getByKey(key)

    if (existing !== undefined) {
      return this.update(existing.id, { value })
    }

    return this.create({ key, value })
  }
}
