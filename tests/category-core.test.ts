import { describe, expect, it } from 'vitest'
import {
  CATEGORY_PALETTE,
  DEFAULT_CATEGORY_COLOR,
  moveOrderedId,
  normalizeCategoryColor,
  normalizeCategoryName,
  sortByOrder
} from '../src/core/categories'

describe('palette des catégories', () => {
  it('contient les dix teintes de la charte, toutes distinctes', () => {
    expect(CATEGORY_PALETTE).toHaveLength(10)
    expect(new Set(CATEGORY_PALETTE.map((entry) => entry.value)).size).toBe(10)
  })

  it('propose une teinte par défaut présente dans la palette', () => {
    expect(CATEGORY_PALETTE.map((entry) => entry.value)).toContain(DEFAULT_CATEGORY_COLOR)
  })
})

describe('normalisation des noms', () => {
  it('retire les espaces de bord et réduit les espaces internes', () => {
    expect(normalizeCategoryName('  Histoire   de l’art  ')).toBe('Histoire de l’art')
  })

  it('renvoie une chaîne vide quand il ne reste rien', () => {
    expect(normalizeCategoryName('   ')).toBe('')
  })
})

describe('normalisation des couleurs', () => {
  it('accepte une couleur hexadécimale à six chiffres', () => {
    expect(normalizeCategoryColor('#3e63dd')).toBe('#3E63DD')
  })

  it('accepte une couleur à trois chiffres, avec ou sans dièse', () => {
    expect(normalizeCategoryColor('#abc')).toBe('#AABBCC')
    expect(normalizeCategoryColor('f0a')).toBe('#FF00AA')
  })

  it('refuse une valeur qui n’est pas une couleur hexadécimale', () => {
    expect(normalizeCategoryColor('bleu')).toBeNull()
    expect(normalizeCategoryColor('#12345')).toBeNull()
    expect(normalizeCategoryColor('rgba(0, 0, 0, 0.5)')).toBeNull()
  })
})

describe('déplacement dans une liste ordonnée', () => {
  it('remonte et descend un identifiant', () => {
    expect(moveOrderedId(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moveOrderedId(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b'])
  })

  it('ne modifie rien aux extrémités ou pour un identifiant absent', () => {
    expect(moveOrderedId(['a', 'b'], 'a', 'up')).toEqual(['a', 'b'])
    expect(moveOrderedId(['a', 'b'], 'b', 'down')).toEqual(['a', 'b'])
    expect(moveOrderedId(['a', 'b'], 'z', 'up')).toEqual(['a', 'b'])
  })

  it('ne modifie pas la liste d’origine', () => {
    const original = ['a', 'b', 'c']
    moveOrderedId(original, 'b', 'up')
    expect(original).toEqual(['a', 'b', 'c'])
  })
})

describe('tri par ordre', () => {
  it('trie sans modifier la collection d’origine', () => {
    const original = [
      { id: 'b', order: 2 },
      { id: 'a', order: 0 },
      { id: 'c', order: 1 }
    ]

    expect(sortByOrder(original).map((record) => record.id)).toEqual(['a', 'c', 'b'])
    expect(original.map((record) => record.id)).toEqual(['b', 'a', 'c'])
  })
})
