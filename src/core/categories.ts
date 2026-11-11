/**
 * Règles pures autour des catégories : palette de la charte, normalisation des
 * saisies et déplacement dans une liste ordonnée.
 */

export interface CategoryPaletteEntry {
  readonly name: string
  readonly value: string
}

/** Les dix teintes proposées par la charte visuelle (document 3). */
export const CATEGORY_PALETTE: readonly CategoryPaletteEntry[] = [
  { name: 'Rouge', value: '#E5484D' },
  { name: 'Orange', value: '#F2730D' },
  { name: 'Ambre', value: '#D9A400' },
  { name: 'Vert', value: '#30A46C' },
  { name: 'Rose', value: '#D6409F' },
  { name: 'Turquoise', value: '#12A594' },
  { name: 'Bleu', value: '#3E63DD' },
  { name: 'Indigo', value: '#6E56CF' },
  { name: 'Violet', value: '#AB4ABA' },
  { name: 'Gris', value: '#8B8D98' }
]

/** Teinte proposée à la création d'une catégorie. */
export const DEFAULT_CATEGORY_COLOR = '#3E63DD'

/** Couleur libre au format `#RGB` ou `#RRGGBB`, avec ou sans dièse. */
const COLOR_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Retire les espaces superflus d'un nom de catégorie ou de groupe. */
export function normalizeCategoryName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Normalise une couleur libre en `#RRGGBB` majuscule. Retourne `null` lorsque
 * la valeur n'est pas une couleur hexadécimale exploitable.
 */
export function normalizeCategoryColor(value: string): string | null {
  const match = COLOR_PATTERN.exec(value.trim())

  if (match === null) return null

  const digits = match[1].toLowerCase()
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => `${digit}${digit}`)
          .join('')
      : digits

  return `#${expanded.toUpperCase()}`
}

export type MoveDirection = 'up' | 'down'

/**
 * Déplace un identifiant d'un cran dans une liste ordonnée. La liste d'origine
 * n'est pas modifiée ; un déplacement impossible renvoie une copie identique.
 */
export function moveOrderedId(
  orderedIds: readonly string[],
  id: string,
  direction: MoveDirection
): string[] {
  const index = orderedIds.indexOf(id)

  if (index === -1) return [...orderedIds]

  const targetIndex = direction === 'up' ? index - 1 : index + 1

  if (targetIndex < 0 || targetIndex >= orderedIds.length) return [...orderedIds]

  const next = [...orderedIds]
  const current = next[index]
  next[index] = next[targetIndex]
  next[targetIndex] = current

  return next
}

/** Trie une collection par ordre croissant sans modifier l'originale. */
export function sortByOrder<T extends { order: number }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => a.order - b.order)
}
