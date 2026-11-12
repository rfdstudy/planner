import { describe, expect, it } from 'vitest'
import {
  buildWeeklyRrule,
  buildYearlyRrule,
  computeOccurrences,
  occurrenceId,
  occurrencesForTemplate,
  parseWeeklyDays,
  removeWeekdayFromRrule,
  replaceWeekdayInRrule,
  weekdayCodeFromDate
} from '../src/core/recurrence'
import { DEFAULT_ITEM_TYPE_IDS } from '../src/core/itemTypes'
import type { LocalDate, Override, Template } from '../src/core/types'

const TIMESTAMP = '2026-11-01T10:00:00.000Z'

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'template-1',
    typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
    title: 'Cours',
    categoryId: null,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
    startMin: 8 * 60,
    durationMin: 120,
    validFrom: '2026-11-02',
    validUntil: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    ...overrides
  }
}

function makeOverride(overrides: Partial<Override> = {}): Override {
  return {
    id: 'override-1',
    templateId: 'template-1',
    date: '2026-11-04',
    action: 'skip',
    typeId: null,
    title: null,
    categoryId: null,
    startMin: null,
    durationMin: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    ...overrides
  }
}

const WEEK: { start: LocalDate; end: LocalDate } = {
  start: '2026-11-02',
  end: '2026-11-08'
}

describe('règles hebdomadaires', () => {
  it('construit une règle à partir de jours multiples, dans l’ordre de la semaine', () => {
    expect(buildWeeklyRrule(['WE', 'MO', 'WE'])).toBe('FREQ=WEEKLY;BYDAY=MO,WE')
    expect(parseWeeklyDays('FREQ=WEEKLY;BYDAY=MO,WE')).toEqual(['MO', 'WE'])
    expect(parseWeeklyDays('RRULE:FREQ=WEEKLY;BYDAY=SU,FR')).toEqual(['FR', 'SU'])
  })

  it('refuse une règle sans jour ou un jour inconnu', () => {
    expect(() => buildWeeklyRrule([])).toThrow(RangeError)
    expect(() => buildWeeklyRrule(['XX' as never])).toThrow(RangeError)
    expect(parseWeeklyDays('FREQ=DAILY')).toEqual([])
  })

  it('remplace ou retire un jour de la règle', () => {
    expect(replaceWeekdayInRrule('FREQ=WEEKLY;BYDAY=MO,WE', 'MO', 'TU')).toBe(
      'FREQ=WEEKLY;BYDAY=TU,WE'
    )
    expect(replaceWeekdayInRrule('FREQ=WEEKLY;BYDAY=MO', 'MO', 'TU')).toBe('FREQ=WEEKLY;BYDAY=TU')
    expect(removeWeekdayFromRrule('FREQ=WEEKLY;BYDAY=MO,WE', 'MO')).toBe('FREQ=WEEKLY;BYDAY=WE')
    expect(removeWeekdayFromRrule('FREQ=WEEKLY;BYDAY=MO', 'MO')).toBeNull()
    expect(weekdayCodeFromDate('2026-11-11')).toBe('WE')
  })
})

describe('occurrences d’un modèle', () => {
  it('calcule les jours multiples d’une même semaine', () => {
    const occurrences = computeOccurrences([makeTemplate()], [], WEEK)

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(['2026-11-02', '2026-11-04'])
    expect(occurrences.map((occurrence) => occurrence.id)).toEqual([
      occurrenceId('template-1', '2026-11-02'),
      occurrenceId('template-1', '2026-11-04')
    ])
    expect(occurrences[0]).toMatchObject({
      templateId: 'template-1',
      typeId: DEFAULT_ITEM_TYPE_IDS.fixed,
      title: 'Cours',
      startMin: 480,
      durationMin: 120,
      overrideId: null
    })
  })

  it('respecte la période de validité, bornes incluses', () => {
    const template = makeTemplate({
      validFrom: '2026-11-03',
      validUntil: '2026-11-05'
    })

    const occurrences = occurrencesForTemplate(template, [], WEEK)

    // Seul le mercredi 4 novembre tombe dans la période.
    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(['2026-11-04'])

    expect(
      occurrencesForTemplate(template, [], { start: '2026-11-09', end: '2026-11-15' })
    ).toEqual([])
  })

  it('exclut une occurrence supprimée par une exception', () => {
    const occurrences = computeOccurrences([makeTemplate()], [makeOverride()], WEEK)

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(['2026-11-02'])
  })

  it('applique les champs modifiés d’une exception, sans toucher aux autres occurrences', () => {
    const template = makeTemplate({ categoryId: 'maths' })
    const override = makeOverride({
      action: 'modify',
      title: 'Cours décalé',
      categoryId: null,
      startMin: 10 * 60,
      durationMin: 90
    })

    const occurrences = occurrencesForTemplate(template, [override], WEEK)

    expect(occurrences).toHaveLength(2)
    expect(occurrences[0]).toMatchObject({
      date: '2026-11-02',
      title: 'Cours',
      categoryId: 'maths',
      startMin: 480,
      durationMin: 120,
      overrideId: null
    })
    expect(occurrences[1]).toMatchObject({
      date: '2026-11-04',
      title: 'Cours décalé',
      categoryId: null,
      startMin: 600,
      durationMin: 90,
      overrideId: 'override-1'
    })
  })

  it('ignore une exception supprimée ou une occurrence hors de sa date', () => {
    const deletedSkip = makeOverride({ deletedAt: '2026-11-02T10:00:00.000Z' })
    const otherDateModify = makeOverride({
      action: 'modify',
      date: '2026-11-11',
      title: 'Ne doit pas sortir de sa date'
    })

    const occurrences = occurrencesForTemplate(makeTemplate(), [deletedSkip, otherDateModify], WEEK)

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(['2026-11-02', '2026-11-04'])
    expect(occurrences.every((occurrence) => occurrence.title === 'Cours')).toBe(true)
  })

  it('ne calcule rien pour un modèle supprimé ou une règle illisible', () => {
    expect(
      computeOccurrences([makeTemplate({ deletedAt: '2026-11-01T10:00:00.000Z' })], [], WEEK)
    ).toEqual([])
    expect(computeOccurrences([makeTemplate({ rrule: 'PAS UNE RRULE' })], [], WEEK)).toEqual([])
  })
})

describe('récurrence annuelle', () => {
  it('calcule une occurrence chaque année à la même date', () => {
    const template = makeTemplate({
      rrule: buildYearlyRrule(),
      validFrom: '2026-11-11',
      title: 'Anniversaire'
    })

    const occurrences = occurrencesForTemplate(template, [], {
      start: '2026-01-01',
      end: '2028-12-31'
    })

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual([
      '2026-11-11',
      '2027-11-11',
      '2028-11-11'
    ])
  })

  it('gère le 29 février : occurrence uniquement les années bissextiles', () => {
    const template = makeTemplate({
      rrule: buildYearlyRrule(),
      validFrom: '2024-02-29',
      title: 'Anniversaire bissextile'
    })

    const occurrences = occurrencesForTemplate(template, [], {
      start: '2025-01-01',
      end: '2029-12-31'
    })

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(['2028-02-29'])
  })

  it('applique une exception de type sur une occurrence annuelle', () => {
    const template = makeTemplate({
      rrule: buildYearlyRrule(),
      validFrom: '2026-11-11'
    })
    const override = makeOverride({
      action: 'modify',
      date: '2027-11-11',
      typeId: DEFAULT_ITEM_TYPE_IDS.event,
      title: 'Fête',
      categoryId: null,
      startMin: 0,
      durationMin: 60
    })

    const occurrences = occurrencesForTemplate(template, [override], {
      start: '2026-01-01',
      end: '2027-12-31'
    })

    expect(occurrences[1]).toMatchObject({
      date: '2027-11-11',
      typeId: DEFAULT_ITEM_TYPE_IDS.event,
      title: 'Fête'
    })
  })
})
