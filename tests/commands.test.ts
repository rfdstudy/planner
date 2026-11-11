import { describe, expect, it } from 'vitest'
import { filterCommands, normalizeCommandQuery } from '../src/core/commands'

const COMMANDS = [
  { id: 'new', label: 'Nouvelle tâche', keywords: ['ajouter', 'créer'] },
  { id: 'date', label: 'Aller à une date…', keywords: ['calendrier'] },
  { id: 'categories', label: 'Ouvrir Catégories', keywords: ['matières'] },
  { id: 'export', label: 'Exporter la sauvegarde', keywords: ['json', 'fichier'] }
]

describe('recherche de commandes', () => {
  it('ignore la casse et les accents', () => {
    expect(normalizeCommandQuery('  CATÉGORIES  ')).toBe('categories')
    expect(filterCommands(COMMANDS, 'categorie').map((command) => command.id)).toEqual([
      'categories'
    ])
    expect(filterCommands(COMMANDS, 'tache').map((command) => command.id)).toEqual(['new'])
  })

  it('cherche aussi dans les synonymes', () => {
    expect(filterCommands(COMMANDS, 'matieres').map((command) => command.id)).toEqual([
      'categories'
    ])
    expect(filterCommands(COMMANDS, 'fichier').map((command) => command.id)).toEqual(['export'])
  })

  it('renvoie toutes les commandes dans l’ordre pour une requête vide', () => {
    expect(filterCommands(COMMANDS, '')).toEqual(COMMANDS)
    expect(filterCommands(COMMANDS, '   ')).toEqual(COMMANDS)
  })

  it('renvoie une liste vide sans correspondance', () => {
    expect(filterCommands(COMMANDS, 'introuvable')).toEqual([])
  })
})
