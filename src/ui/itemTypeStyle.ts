import type { CSSProperties } from 'react'
import type { ItemType } from '../core/types'

/**
 * Expose la couleur propre d'un type comme variable CSS locale. Les composants
 * ne contiennent aucune couleur en dur : le style décide s'il l'utilise.
 */
export function itemTypeColorStyle(type: ItemType): CSSProperties {
  return type.color === null ? {} : ({ '--type-color': type.color } as CSSProperties)
}
