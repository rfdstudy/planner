/** Élément minimal affiché et filtré par la palette de commandes. */
export interface PaletteCommand {
  id: string
  label: string
  /** Texte secondaire discret, par exemple un raccourci. */
  hint?: string
  /** Synonymes indexés en plus du libellé. */
  keywords?: readonly string[]
}

/**
 * Normalise une recherche : minuscules, sans accents et sans espaces superflus.
 * « Catégories » doit se trouver en tapant « categorie ».
 */
export function normalizeCommandQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim()
}

/**
 * Filtre les commandes sur leur libellé et leurs synonymes. Une requête vide
 * renvoie toute la liste, dans l'ordre fourni.
 */
export function filterCommands<T extends PaletteCommand>(
  commands: readonly T[],
  query: string
): T[] {
  const normalized = normalizeCommandQuery(query)

  if (normalized.length === 0) return [...commands]

  return commands.filter((command) => {
    const haystack = [command.label, ...(command.keywords ?? [])]
      .map(normalizeCommandQuery)
      .join(' ')

    return haystack.includes(normalized)
  })
}
