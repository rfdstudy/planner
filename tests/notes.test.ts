import { describe, expect, it } from 'vitest'
import { notesTaskProgress, parseNotes, serializeNotes } from '../src/core/notes'
import { editorContentToNotes, notesToEditorContent } from '../src/ui/week/notesContent'

describe('notes : cases à cocher', () => {
  it('lit une case décochée et une case cochée', () => {
    expect(parseNotes('- [ ] Réviser le chapitre\n- [x] Faire les exercices')).toEqual([
      { type: 'task', checked: false, text: 'Réviser le chapitre' },
      { type: 'task', checked: true, text: 'Faire les exercices' }
    ])
  })

  it('réécrit les cases cochées ou non au format Markdown', () => {
    const lines = [
      { type: 'task' as const, checked: false, text: 'À faire' },
      { type: 'task' as const, checked: true, text: 'Fait' }
    ]

    expect(serializeNotes(lines)).toBe('- [ ] À faire\n- [x] Fait')
  })

  it('mélange lignes de texte, lignes vides et cases', () => {
    const markdown = 'Avant\n- [ ] Première\n\n- [x] Deuxième\nAprès'

    expect(parseNotes(markdown)).toEqual([
      { type: 'text', text: 'Avant' },
      { type: 'task', checked: false, text: 'Première' },
      { type: 'text', text: '' },
      { type: 'task', checked: true, text: 'Deuxième' },
      { type: 'text', text: 'Après' }
    ])
    expect(serializeNotes(parseNotes(markdown))).toBe(markdown)
  })

  it('accepte une case vide et garde une case vide vide', () => {
    expect(parseNotes('- [ ]')).toEqual([{ type: 'task', checked: false, text: '' }])
    expect(parseNotes('- [x]')).toEqual([{ type: 'task', checked: true, text: '' }])
    expect(
      serializeNotes([
        { type: 'task', checked: false, text: '' },
        { type: 'task', checked: true, text: '' }
      ])
    ).toBe('- [ ]\n- [x]')
  })

  it('normalise la casse du x et accepte l’astérisque en lecture', () => {
    expect(parseNotes('* [X] Fait')).toEqual([{ type: 'task', checked: true, text: 'Fait' }])
    expect(serializeNotes(parseNotes('* [X] Fait'))).toBe('- [x] Fait')
  })

  it('conserve une note vide', () => {
    expect(parseNotes('')).toEqual([])
    expect(serializeNotes([])).toBe('')
    expect(serializeNotes(parseNotes(''))).toBe('')
  })

  it('affiche une ancienne note sans case exactement comme avant', () => {
    const markdown = 'Chapitre 3\n\nRelire la fiche\n- point normal sans case'

    expect(parseNotes(markdown)).toEqual([
      { type: 'text', text: 'Chapitre 3' },
      { type: 'text', text: '' },
      { type: 'text', text: 'Relire la fiche' },
      { type: 'text', text: '- point normal sans case' }
    ])
    expect(serializeNotes(parseNotes(markdown))).toBe(markdown)
  })

  it('conserve les espaces et les lignes multiples lors de l’aller-retour', () => {
    const markdown = '  Texte indenté  \n- [ ]  Case avec espaces  \n\nFin'

    expect(serializeNotes(parseNotes(markdown))).toBe(markdown)
  })

  it('compte les cases cochées et le total', () => {
    expect(notesTaskProgress('Avant\n- [ ] A\n- [x] B\n- [ ] C')).toEqual({
      checked: 1,
      total: 3
    })
    expect(notesTaskProgress('Avant\n- [x] A\n- [x] B')).toEqual({ checked: 2, total: 2 })
    expect(notesTaskProgress('Texte simple')).toEqual({ checked: 0, total: 0 })
    expect(notesTaskProgress('')).toEqual({ checked: 0, total: 0 })
  })
})

describe('notes : conversion avec l’éditeur', () => {
  it('conserve les cases cochées et non cochées dans les deux sens', () => {
    const markdown = 'Avant\n- [ ] À faire\n- [x] Fait\n\nAprès'

    expect(editorContentToNotes(notesToEditorContent(markdown))).toBe(markdown)
  })

  it('conserve une note vide', () => {
    const content = notesToEditorContent('')

    expect(content).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(editorContentToNotes(content)).toBe('')
  })

  it('relit une ancienne note sans case sans la modifier', () => {
    const markdown = 'Chapitre 3\n\nRelire la fiche'

    expect(editorContentToNotes(notesToEditorContent(markdown))).toBe(markdown)
  })

  it('groupe les cases consécutives dans une même liste', () => {
    const content = notesToEditorContent('- [ ] A\n- [x] B')
    const [taskList] = content.content ?? []

    expect(taskList?.type).toBe('taskList')
    expect(taskList?.content).toHaveLength(2)
    expect(taskList?.content?.[1]?.attrs).toEqual({ checked: true })
  })
})
