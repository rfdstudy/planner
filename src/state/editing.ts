import { create } from 'zustand'
import type { DuplicateSource } from '../core/duplicate'

/** Élément désigné par le clavier : bloc de la grille ou rangée à planifier. */
export type EditingSelection =
  { kind: 'block'; blockId: string } | { kind: 'inbox'; itemId: string } | null

interface EditingState {
  selection: EditingSelection
  /** Presse-papiers interne : jamais le presse-papiers système. */
  clipboard: DuplicateSource | null
  /** Copie à afficher juste sous son original dans « À planifier ». */
  duplicateAfter: Record<string, string>
  select: (selection: EditingSelection) => void
  copyToClipboard: (source: DuplicateSource) => void
  noteDuplicate: (copyId: string, sourceId: string) => void
}

/**
 * État partagé par la grille et le panneau « À planifier ». Il ne contient que
 * la sélection, le presse-papiers et l'ordre local des copies : aucune donnée
 * métier n'est écrite ici.
 */
export const useEditingStore = create<EditingState>((set) => ({
  selection: null,
  clipboard: null,
  duplicateAfter: {},
  select: (selection) => set({ selection }),
  copyToClipboard: (clipboard) => set({ clipboard }),
  noteDuplicate: (copyId, sourceId) =>
    set((state) => ({
      duplicateAfter: { ...state.duplicateAfter, [copyId]: sourceId }
    }))
}))
