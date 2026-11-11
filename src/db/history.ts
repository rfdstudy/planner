/**
 * Pile d'annulation en mémoire.
 *
 * Les repositories enregistrent une action inverse après chaque écriture
 * annulable. La pile est volontairement limitée (50 niveaux par défaut) et
 * n'est jamais persistée : relancer l'application repart d'un historique vide.
 */
export const UNDO_HISTORY_LIMIT = 50

export interface UndoAction {
  /** Libellé lisible, utile pour les messages d'erreur ou une future interface. */
  label: string
  /** Écriture inverse, exécutée par les repositories. */
  undo: () => Promise<void>
}

export class UndoHistory {
  private readonly actions: UndoAction[] = []
  private undoInFlight = false

  constructor(private readonly limit: number = UNDO_HISTORY_LIMIT) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError('La taille de l’historique doit être un entier strictement positif.')
    }
  }

  /** Nombre d'actions actuellement annulables. */
  get size(): number {
    return this.actions.length
  }

  /** Ajoute une action et retire les plus anciennes au-delà de la limite. */
  push(action: UndoAction): void {
    this.actions.push(action)

    if (this.actions.length > this.limit) {
      this.actions.splice(0, this.actions.length - this.limit)
    }
  }

  /**
   * Annule une action précise, ou la dernière par défaut. L'action reste dans
   * la pile si son exécution échoue, afin de pouvoir réessayer. Renvoie
   * l'action annulée, ou `null` si elle n'est plus dans la pile ou si une
   * annulation est déjà en cours.
   */
  async undo(target?: UndoAction): Promise<UndoAction | null> {
    if (this.undoInFlight) return null

    const action = target ?? this.actions[this.actions.length - 1]

    if (action === undefined || !this.actions.includes(action)) return null

    this.undoInFlight = true

    try {
      await action.undo()

      const index = this.actions.lastIndexOf(action)

      if (index !== -1) {
        this.actions.splice(index, 1)
      }

      return action
    } finally {
      this.undoInFlight = false
    }
  }

  clear(): void {
    this.actions.length = 0
  }
}
