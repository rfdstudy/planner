import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ELEMENT_DURATION_MIN,
  createNewElementDraft,
  elementDraftFrom,
  snapNewBlockStart,
  taskDraftFrom,
  validateElementDraft,
  validateTaskDraft,
  type ElementDraft
} from '../src/core/elementEditor'
import type { Block, Item } from '../src/core/types'
import { EXAM_TYPE, FIXED_TYPE, TASK_TYPE } from './testItemTypes'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    deletedAt: null,
    typeId: TASK_TYPE.id,
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
    ...createNewElementDraft({ date: '2026-11-12', startMin: 840, type: TASK_TYPE }),
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
    expect(createNewElementDraft({ date: '2026-11-12', startMin: 840, type: TASK_TYPE })).toEqual({
      variant: 'element',
      typeId: TASK_TYPE.id,
      isTask: true,
      title: '',
      notes: '',
      categoryId: null,
      date: '2026-11-12',
      endDate: '',
      time: '14:00',
      fullDay: false,
      durationMin: '60',
      estimateMin: '',
      status: 'todo'
    })
  })

  it('prépare un type de la ligne du haut sans heure', () => {
    const draft = createNewElementDraft({
      date: '2026-11-12',
      startMin: 840,
      type: EXAM_TYPE
    })

    expect(draft.fullDay).toBe(true)
    expect(draft.time).toBe('')
    expect(draft.isTask).toBe(false)
    expect(draft.endDate).toBe('2026-11-12')
  })

  it('prépare une bande de plusieurs jours depuis la ligne du haut', () => {
    const draft = createNewElementDraft({
      date: '2026-11-12',
      startMin: 0,
      type: EXAM_TYPE,
      endDate: '2026-11-14'
    })

    expect(draft.fullDay).toBe(true)
    expect(draft.time).toBe('')
    expect(draft.endDate).toBe('2026-11-14')
  })

  it('relit la date de fin d’une période existante', () => {
    const draft = elementDraftFrom(
      makeItem({ typeId: EXAM_TYPE.id, status: null, estimateMin: null }),
      makeBlock({ startMin: null, endDate: '2026-11-15' }),
      EXAM_TYPE
    )

    expect(draft.fullDay).toBe(true)
    expect(draft.endDate).toBe('2026-11-15')
  })

  it('relit un élément et son bloc existants', () => {
    const draft = elementDraftFrom(makeItem(), makeBlock(), TASK_TYPE)

    expect(draft).toEqual({
      variant: 'element',
      typeId: TASK_TYPE.id,
      isTask: true,
      title: 'DM Maths',
      notes: 'Chapitre 3',
      categoryId: 'category-1',
      date: '2026-11-12',
      endDate: '',
      time: '14:00',
      fullDay: false,
      durationMin: '90',
      estimateMin: '120',
      status: 'todo'
    })
  })

  it('relit une épreuve sans heure comme un bloc de la ligne du haut', () => {
    const draft = elementDraftFrom(
      makeItem({
        typeId: EXAM_TYPE.id,
        status: null,
        estimateMin: null
      }),
      makeBlock({ startMin: null }),
      EXAM_TYPE
    )

    expect(draft.fullDay).toBe(true)
    expect(draft.time).toBe('')
    expect(draft.estimateMin).toBe('')
    expect(draft.isTask).toBe(false)
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
        typeId: TASK_TYPE.id,
        title: 'Révisions',
        notes: 'Fiche 5',
        categoryId: null,
        date: '2026-11-12',
        endDate: null,
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
      validDraft({
        typeId: FIXED_TYPE.id,
        isTask: false,
        estimateMin: '120',
        status: 'done'
      })
    )

    expect(validation.ok && validation.values.estimateMin).toBeNull()
    expect(validation.ok && validation.values.status).toBeNull()
  })

  it('accepte une épreuve en journée entière', () => {
    const validation = validateElementDraft(
      validDraft({
        typeId: EXAM_TYPE.id,
        isTask: false,
        fullDay: true,
        time: '',
        estimateMin: ''
      })
    )

    expect(validation.ok && validation.values.startMin).toBeNull()
  })

  it('accepte une date de fin inclusive sur la ligne du haut', () => {
    const validation = validateElementDraft(
      validDraft({
        typeId: EXAM_TYPE.id,
        isTask: false,
        fullDay: true,
        time: '',
        endDate: '2026-11-14',
        estimateMin: '',
        status: null
      })
    )

    expect(validation.ok && validation.values.endDate).toBe('2026-11-14')
    expect(validation.ok && validation.values.startMin).toBeNull()
  })

  it('normalise une date de fin égale au début en élément d’un jour', () => {
    const validation = validateElementDraft(
      validDraft({
        typeId: EXAM_TYPE.id,
        isTask: false,
        fullDay: true,
        time: '',
        endDate: '2026-11-12',
        estimateMin: '',
        status: null
      })
    )

    expect(validation.ok && validation.values.endDate).toBeNull()
  })

  it('refuse une date de fin antérieure au début', () => {
    expect(
      validateElementDraft(
        validDraft({
          typeId: EXAM_TYPE.id,
          isTask: false,
          fullDay: true,
          time: '',
          endDate: '2026-11-10',
          estimateMin: '',
          status: null
        })
      )
    ).toEqual({
      ok: false,
      message: 'La date de fin doit être égale ou postérieure à la date de début.'
    })
  })

  it('refuse une date de fin invalide', () => {
    expect(
      validateElementDraft(
        validDraft({
          typeId: EXAM_TYPE.id,
          isTask: false,
          fullDay: true,
          time: '',
          endDate: '2026-02-30',
          estimateMin: '',
          status: null
        })
      )
    ).toEqual({
      ok: false,
      message: 'Choisissez une date de fin valide.'
    })
  })

  it('exige une heure pour un bloc horaire', () => {
    expect(validateElementDraft(validDraft({ time: '' }))).toEqual({
      ok: false,
      message: 'Indiquez une heure de début.'
    })
    expect(
      validateElementDraft(
        validDraft({ typeId: EXAM_TYPE.id, isTask: false, fullDay: false, time: '' })
      )
    ).toEqual({
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

describe('édition d’une tâche sans bloc', () => {
  it('relit une tâche à planifier sans champ de placement', () => {
    expect(taskDraftFrom(makeItem(), TASK_TYPE)).toEqual({
      variant: 'task',
      title: 'DM Maths',
      notes: 'Chapitre 3',
      categoryId: 'category-1',
      estimateMin: '120'
    })
  })

  it('refuse un élément qui n’est pas une tâche', () => {
    expect(() => taskDraftFrom(makeItem({ typeId: FIXED_TYPE.id }), FIXED_TYPE)).toThrow(RangeError)
  })

  it('renvoie des valeurs normalisées sans exiger de date ni d’heure', () => {
    expect(
      validateTaskDraft({
        variant: 'task',
        title: '  Révisions  ',
        notes: '  Fiche 5  ',
        categoryId: 'category-1',
        estimateMin: '90'
      })
    ).toEqual({
      ok: true,
      values: {
        title: 'Révisions',
        notes: 'Fiche 5',
        categoryId: 'category-1',
        estimateMin: 90
      }
    })
  })

  it('accepte une durée estimée vide', () => {
    const validation = validateTaskDraft({
      variant: 'task',
      title: 'Révisions',
      notes: '',
      categoryId: null,
      estimateMin: '   '
    })

    expect(validation.ok && validation.values.estimateMin).toBeNull()
  })

  it('exige un titre et une durée estimée entière', () => {
    expect(
      validateTaskDraft({
        variant: 'task',
        title: '   ',
        notes: '',
        categoryId: null,
        estimateMin: ''
      })
    ).toEqual({ ok: false, message: 'Donnez un titre à la tâche.' })

    expect(
      validateTaskDraft({
        variant: 'task',
        title: 'Révisions',
        notes: '',
        categoryId: null,
        estimateMin: '45,5'
      })
    ).toEqual({
      ok: false,
      message: 'La durée estimée doit être un nombre entier de minutes.'
    })
  })
})
