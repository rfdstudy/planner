import type { CSSProperties } from 'react'

/**
 * Expose la couleur d'une catégorie (donnée) comme variable CSS locale.
 * Les composants ne contiennent ainsi aucune couleur en dur.
 */
export function categoryColorStyle(color: string): CSSProperties {
  return { '--category-color': color } as CSSProperties
}
