import type { Table } from 'dexie'
import type { BaseRecord } from '../../core/types'

/** Données créables : tout sauf les champs techniques communs. */
export type EntityData<T extends BaseRecord> = Omit<T, keyof BaseRecord>

/** Champs modifiables : les champs techniques ne le sont jamais directement. */
export type EntityPatch<T extends BaseRecord> = Partial<EntityData<T>>

export interface ReadOptions {
  includeDeleted?: boolean
}

export class RecordNotFoundError extends Error {
  constructor(entityLabel: string, id: string) {
    super(`${entityLabel} introuvable : ${id}`)
    this.name = 'RecordNotFoundError'
  }
}

export class RecordDeletedError extends Error {
  constructor(entityLabel: string, id: string) {
    super(`${entityLabel} déjà supprimé : ${id}`)
    this.name = 'RecordDeletedError'
  }
}

/**
 * Comportement commun aux repositories : création, lecture, modification et
 * suppression logique. Toutes les écritures passent par cette couche.
 */
export abstract class BaseRepository<T extends BaseRecord> {
  protected constructor(
    protected readonly table: Table<T, string>,
    private readonly entityLabel: string
  ) {}

  protected nowIso(): string {
    return new Date().toISOString()
  }

  protected async insert(data: EntityData<T>): Promise<T> {
    const timestamp = this.nowIso()
    const record = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    } as T

    await this.table.add(record)
    return record
  }

  async get(id: string, options: ReadOptions = {}): Promise<T | undefined> {
    const record = await this.table.get(id)

    if (record === undefined) return undefined
    if (!options.includeDeleted && record.deletedAt !== null) return undefined

    return record
  }

  async list(options: ReadOptions = {}): Promise<T[]> {
    const records = await this.table.toArray()
    return this.filterReadable(records, options)
  }

  async update(id: string, patch: EntityPatch<T>): Promise<T> {
    const record = await this.requireActive(id)
    const updated = {
      ...record,
      ...patch,
      updatedAt: this.nowIso()
    } as T

    await this.table.put(updated)
    return updated
  }

  /** Suppression logique : la ligne reste en base avec `deletedAt`. */
  async softDelete(id: string): Promise<T> {
    const record = await this.requireActive(id)
    const timestamp = this.nowIso()
    const deleted = {
      ...record,
      updatedAt: timestamp,
      deletedAt: timestamp
    }

    await this.table.put(deleted)
    return deleted
  }

  /**
   * Annule une suppression logique. Une ligne déjà active est renvoyée telle
   * quelle, ce qui rend la restauration sûre à rejouer.
   */
  async restore(id: string): Promise<T> {
    const record = await this.table.get(id)

    if (record === undefined) {
      throw new RecordNotFoundError(this.entityLabel, id)
    }

    if (record.deletedAt === null) return record

    const restored = {
      ...record,
      updatedAt: this.nowIso(),
      deletedAt: null
    }

    await this.table.put(restored)
    return restored
  }

  protected async requireActive(id: string): Promise<T> {
    const record = await this.table.get(id)

    if (record === undefined) {
      throw new RecordNotFoundError(this.entityLabel, id)
    }

    if (record.deletedAt !== null) {
      throw new RecordDeletedError(this.entityLabel, id)
    }

    return record
  }

  protected filterReadable(records: T[], options: ReadOptions = {}): T[] {
    if (options.includeDeleted) return records

    return records.filter((record) => record.deletedAt === null)
  }
}
