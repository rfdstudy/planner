import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ELEMENT_DURATION_MIN,
  createNewElementDraft,
  elementDraftFrom,
  snapNewBlockStart,
  validateElementDraft,
  type ElementDraft
} from '../src/core/elementEditor'
import type { Block, Item } from '../src/core/types'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    deletedAt: null,
    kind: 'task',
    title: 'DM Maths',
    notes: 'Chapitre 3',
    categoryId: 'category-1',
    estimateMin: 120,
    status: 'todo',
    templateId: null,
    ...overrides
  }
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    deletedAt: null,
    itemId: 'item-1',
    date: '2026-11-12',
    startMin: 840,
    durationMin: 90,
    ...overrides
  }
}

function validDraft(overrides: Partial<ElementDraft> = {}): ElementDraft {
  return {
    ...createNewElementDraft({ date: '2026-11-12', startMin: 840 }),
    title: 'Révisions',
    ...overrides
  }
}

describe('nouveau bloc sur la grille', () => {
  it('accroche le clic au pas de 15 minutes', () => {
    expect(snapNewBlockStart(842)).toBe(840)
    expect(snapNewBlockStart(850)).toBe(855)
    expect(snapNewBlockStart(7)).toBe(0)
    expect(snapNewBlockStart(8)).toBe(15)
  })

  it('garde le bloc entier dans la journée', () => {
    expect(snapNewBlockStart(1439)).toBe(1440 - DEFAULT_ELEMENT_DURATION_MIN)
    expect(snapNewBlockStart(1439, 30)).toBe(1410)
    expect(snapNewBlockStart(-20)).toBe(0)
  })

  it('prépare un brouillon de tâche à l’heure accrochée', () => {
    expect(createNewElementDraft({ date: '2026-11-12', startMin: 840 })).toEqual({
      kind: 'task',
      title: '',
      notes: '',
      categoryId: null,
      date: '2026-11-12',
      time: '14:00',
      noTime: false,
      durationMin: '60',
      estimateMin: '',
      status: 'todo'
    })
  })

  it('relit un élément et son bloc existants', () => {
    const draft = elementDraftFrom(makeItem(), makeBlock())

    expect(draft).toEqual({
      kind: 'task',
      title: 'DM Maths',
      notes: 'Chapitre 3',
      categoryId: 'category-1',
      date: '2026-11-12',
      time: '14:00',
      noTime: false,
      durationMin: '90',
      estimateMin: '120',
      status: 'todo'
    })
  })

  it('relit une épreuve sans heure comme un bloc de la ligne du haut', () => {
    const draft = elementDraftFrom(
      makeItem({ kind: 'exam', status: null, estimateMin: null }),
      makeBlock({ startMin: null })
    )

    expect(draft.noTime).toBe(true)
    expect(draft.time).toBe('')
    expect(draft.estimateMin).toBe('')
  })
})

describe('validation du brouillon', () => {
  it('exige un titre', () => {
    expect(validateElementDraft(validDraft({ title: '   ' }))).toEqual({
      ok: false,
      message: 'Donnez un titre à l’élément.'
    })
  })

  it('renvoie des valeurs normalisées pour une tâche', () => {
    expect(
      validateElementDraft(
        validDraft({
          title: '  Révisions  ',
          notes: '  Fiche 5  ',
          durationMin: '45',
          estimateMin: '90',
          status: 'done'
        })
      )
    ).toEqual({
      ok: true,
      values: {
        kind: 'task',
        title: 'Révisions',
        notes: 'Fiche 5',
        categoryId: null,
        date: '2026-11-12',
        startMin: 840,
        durationMin: 45,
        estimateMin: 90,
        status: 'done'
      }
    })
  })

  it('force une tâche sans statut à rester à faire', () => {
    const validation = validateElementDraft(validDraft({ status: null }))

    expect(validation.ok && validation.values.status).toBe('todo')
  })

  it('ignore la durée estimée et le statut hors des tâches', () => {
    const validation = validateElementDraft(
      validDraft({ kind: 'fixed', estimateMin: '120', status: 'done' })
    )

    expect(validation.ok && validation.values.estimateMin).toBeNull()
    expect(validation.ok && validation.values.status).toBeNull()
  })

  it('accepte une épreuve sans heure', () => {
    const validation = validateElementDraft(
      validDraft({ kind: 'exam', noTime: true, time: '', estimateMin: '' })
    )

    expect(validation.ok && validation.values.startMin).toBeNull()
  })

  it('exige une heure pour une épreuve horaire et pour les autres types', () => {
    expect(validateElementDraft(validDraft({ time: '' }))).toEqual({
      ok: false,
      message: 'Indiquez une heure de début.'
    })
    expect(validateElementDraft(validDraft({ kind: 'exam', noTime: false, time: '' }))).toEqual({
      ok: false,
      message: 'Indiquez une heure de début.'
    })
  })

  it('refuse une date invalide', () => {
    expect(validateElementDraft(validDraft({ date: '2026-02-30' }))).toEqual({
      ok: false,
      message: 'Choisissez une date valide.'
    })
  })

  it('refuse une durée absente, nulle ou hors de la journée', () => {
    expect(validateElementDraft(validDraft({ durationMin: '' })).ok).toBe(false)
    expect(validateElementDraft(validDraft({ durationMin: '0' })).ok).toBe(false)
    expect(validateElementDraft(validDraft({ durationMin: '1441' })).ok).toBe(false)
  })

  it('refuse une durée estimée non entière', () => {
    expect(validateElementDraft(validDraft({ estimateMin: '45,5' }))).toEqual({
      ok: false,
      message: 'La durée estimée doit être un nombre entier de minutes.'
    })
  })

  it('refuse un bloc qui dépasserait minuit', () => {
    expect(validateElementDraft(validDraft({ time: '23:30', durationMin: '60' }))).toEqual({
      ok: false,
      message: 'Le bloc dépasserait minuit.'
    })
  })
})
