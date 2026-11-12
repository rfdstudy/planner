import { MINUTES_PER_DAY, isLocalDate } from '../../core/time'
import type { Block, Item, LocalDate } from '../../core/types'
import type { PlannerDatabase } from '../database'
import type { UndoAction, UndoHistory } from '../history'
import { RecordNotFoundError } from './base'
import { BlockRepository } from './blocks'
import { ItemRepository } from './items'

export interface MoveBlockInput {
  blockId: string
  date: LocalDate
  startMin: number
}

export interface ResizeBlockInput {
  blockId: string
  durationMin: number
}

export interface PlaceTaskInput {
  itemId: string
  date: LocalDate
  startMin: number
  durationMin: number
}

/** Résultat d'une suppression de tâche, utilisé par le message d'annulation. */
export interface DeletedTaskResult {
  item: Item
  blockCount: number
  action: UndoAction
}

/**
 * Écritures de la grille et du panneau « À planifier ».
 *
 * Chaque opération est atomique du point de vue de l'utilisateur et pousse son
 * inverse dans l'historique. L'interface ne dispose ainsi que de gestes
 * métier : déplacer, redimensionner, placer une tâche, retirer un bloc et
 * supprimer une tâche avec ses blocs.
 */
export class PlanningRepository {
  private readonly blocks: BlockRepository
  private readonly items: ItemRepository

  constructor(
    private readonly database: PlannerDatabase,
    private readonly history: UndoHistory
  ) {
    this.blocks = new BlockRepository(database.blocks)
    this.items = new ItemRepository(database)
  }

  /** Déplace un bloc vers une autre date ou une autre heure. */
  async moveBlock(input: MoveBlockInput): Promise<Block> {
    this.assertDate(input.date)
    this.assertStart(input.startMin)

    const block = await this.requireTimedBlock(input.blockId)

    if (input.startMin + block.durationMin > MINUTES_PER_DAY) {
      throw new RangeError('Le bloc dépasserait minuit.')
    }

    if (block.date === input.date && block.startMin === input.startMin) {
      return block
    }

    const previousDate = block.date
    const previousStartMin = block.startMin
    const updated = await this.blocks.update(block.id, {
      date: input.date,
      startMin: input.startMin
    })

    this.history.push({
      label: 'Déplacement d’un bloc',
      undo: async () => {
        await this.blocks.update(block.id, {
          date: previousDate,
          startMin: previousStartMin
        })
      }
    })

    return updated
  }

  /** Modifie la durée d'un bloc depuis son bord inférieur. */
  async resizeBlock(input: ResizeBlockInput): Promise<Block> {
    this.assertDuration(input.durationMin)

    const block = await this.requireTimedBlock(input.blockId)

    if (block.startMin + input.durationMin > MINUTES_PER_DAY) {
      throw new RangeError('Le bloc dépasserait minuit.')
    }

    if (block.durationMin === input.durationMin) {
      return block
    }

    const previousDurationMin = block.durationMin
    const updated = await this.blocks.update(block.id, { durationMin: input.durationMin })

    this.history.push({
      label: 'Redimensionnement d’un bloc',
      undo: async () => {
        await this.blocks.update(block.id, { durationMin: previousDurationMin })
      }
    })

    return updated
  }

  /**
   * Crée un bloc pour une tâche encore dans « À planifier ». Chaque appel crée
   * un nouveau bloc : une tâche peut ainsi être répartie sur plusieurs jours.
   */
  async placeTask(input: PlaceTaskInput): Promise<Block> {
    this.assertDate(input.date)
    this.assertStart(input.startMin)
    this.assertDuration(input.durationMin)

    if (input.startMin + input.durationMin > MINUTES_PER_DAY) {
      throw new RangeError('Le bloc dépasserait minuit.')
    }

    const item = await this.items.get(input.itemId)

    if (item === undefined) {
      throw new RecordNotFoundError('Élément', input.itemId)
    }

    const type = await this.database.itemTypes.get(item.typeId)

    if (type === undefined) {
      throw new RecordNotFoundError('Type d’élément', item.typeId)
    }

    if (!type.isTask) {
      throw new RangeError('Seules les tâches peuvent être placées depuis le panneau.')
    }

    const block = await this.blocks.create({
      itemId: item.id,
      date: input.date,
      startMin: input.startMin,
      durationMin: input.durationMin
    })

    this.history.push({
      label: 'Placement d’une tâche',
      undo: async () => {
        await this.blocks.softDelete(block.id)
      }
    })

    return block
  }

  /**
   * Retire un bloc de la grille. Si c'était le dernier d'une tâche, celle-ci
   * réapparaît automatiquement dans « À planifier » grâce aux requêtes vivantes.
   */
  async removeBlock(blockId: string): Promise<Block> {
    const block = await this.requireBlock(blockId)
    const deleted = await this.blocks.softDelete(block.id)

    this.history.push({
      label: 'Retrait d’un bloc',
      undo: async () => {
        await this.blocks.restore(block.id)
      }
    })

    return deleted
  }

  /**
   * Supprime logiquement une tâche et tous ses blocs déjà placés, dans une même
   * transaction. L'annulation restaure la tâche et chacun de ses blocs.
   */
  async deleteTask(itemId: string): Promise<DeletedTaskResult> {
    const { item: deletedItem, blocks } = await this.database.transaction(
      'rw',
      [this.database.itemTypes, this.database.items, this.database.blocks],
      async () => {
        const item = await this.items.get(itemId)

        if (item === undefined) {
          throw new RecordNotFoundError('Élément', itemId)
        }

        const type = await this.database.itemTypes.get(item.typeId)

        if (type === undefined) {
          throw new RecordNotFoundError('Type d’élément', item.typeId)
        }

        if (!type.isTask) {
          throw new RangeError('Seules les tâches peuvent être supprimées depuis le panneau.')
        }

        const activeBlocks = await this.blocks.listByItem(itemId)
        const deleted = await this.items.softDelete(itemId)

        for (const block of activeBlocks) {
          await this.blocks.softDelete(block.id)
        }

        return { item: deleted, blocks: activeBlocks }
      }
    )

    const action: UndoAction = {
      label: 'Suppression d’une tâche',
      undo: async () => {
        await this.database.transaction(
          'rw',
          [this.database.items, this.database.blocks],
          async () => {
            await this.items.restore(itemId)

            for (const block of blocks) {
              await this.blocks.restore(block.id)
            }
          }
        )
      }
    }

    this.history.push(action)

    return { item: deletedItem, blockCount: blocks.length, action }
  }

  private async requireBlock(blockId: string): Promise<Block> {
    const block = await this.blocks.get(blockId)

    if (block === undefined) {
      throw new RecordNotFoundError('Bloc', blockId)
    }

    return block
  }

  private async requireTimedBlock(blockId: string): Promise<Block & { startMin: number }> {
    const block = await this.requireBlock(blockId)

    if (block.startMin === null) {
      throw new RangeError('Un bloc sans heure ne peut pas être déplacé sur la grille.')
    }

    return block as Block & { startMin: number }
  }

  private assertDate(date: LocalDate): void {
    if (!isLocalDate(date)) {
      throw new RangeError(`Date locale invalide : ${date}`)
    }
  }

  private assertStart(startMin: number): void {
    if (!Number.isInteger(startMin) || startMin < 0 || startMin >= MINUTES_PER_DAY) {
      throw new RangeError('L’heure de début doit être comprise dans la journée.')
    }
  }

  private assertDuration(durationMin: number): void {
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > MINUTES_PER_DAY) {
      throw new RangeError('La durée doit être un nombre entier de minutes, entre 1 et 1440.')
    }
  }
}
