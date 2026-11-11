import { describe, expect, it } from 'vitest'
import {
  MINUTES_PER_DAY,
  addDays,
  clampMinutes,
  differenceInCalendarDays,
  formatDaysUntil,
  formatDurationMinutes,
  formatLocalDate,
  formatWeekLabel,
  formatWeekdayShort,
  getWeekDays,
  getWeekEnd,
  getWeekRange,
  getWeekStart,
  getWeekdayIndex,
  isLocalDate,
  minutesToTime,
  parseLocalDate,
  parsePositiveMinutes,
  snapMinutes,
  timeToMinutes,
  todayLocalDate
} from '../src/core/time'

describe('dates locales', () => {
  it('formate un Date en date locale sans passer par UTC', () => {
    expect(formatLocalDate(new Date(2026, 10, 12, 23, 30))).toBe('2026-11-12')
    expect(formatLocalDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('relit une date locale à minuit dans le fuseau du poste', () => {
    const date = parseLocalDate('2026-11-12')

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(10)
    expect(date.getDate()).toBe(12)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
  })

  it('refuse les dates impossibles et les formats incorrects', () => {
    expect(() => parseLocalDate('2026-02-30')).toThrow(RangeError)
    expect(() => parseLocalDate('12/11/2026')).toThrow(RangeError)
    expect(isLocalDate('2026-11-12')).toBe(true)
    expect(isLocalDate('2026-02-30')).toBe(false)
  })

  it('donne la date du jour à partir d’un instant fourni', () => {
    expect(todayLocalDate(new Date(2026, 10, 12, 18, 45))).toBe('2026-11-12')
  })

  it('ajoute des jours en traversant les mois, les années et le 29 février', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-11-12', 0)).toBe('2026-11-12')
  })
})

describe('semaine du lundi au dimanche', () => {
  it('trouve le lundi et le dimanche de la semaine', () => {
    expect(getWeekStart('2026-11-12')).toBe('2026-11-09')
    expect(getWeekEnd('2026-11-12')).toBe('2026-11-15')
    expect(getWeekRange('2026-11-12')).toEqual({
      start: '2026-11-09',
      end: '2026-11-15'
    })
  })

  it('traite le lundi et le dimanche comme les bornes de la semaine', () => {
    expect(getWeekStart('2026-11-09')).toBe('2026-11-09')
    expect(getWeekStart('2026-11-15')).toBe('2026-11-09')
  })

  it('traverse le changement d’année', () => {
    expect(getWeekDays('2026-01-01')).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04'
    ])
  })

  it('numérote les jours de 0 (lundi) à 6 (dimanche)', () => {
    expect(getWeekdayIndex('2026-11-09')).toBe(0)
    expect(getWeekdayIndex('2026-11-12')).toBe(3)
    expect(getWeekdayIndex('2026-11-15')).toBe(6)
  })
})

describe('libellés de calendrier', () => {
  it('écrit une semaine dans le même mois', () => {
    expect(formatWeekLabel('2026-11-12')).toBe('9 – 15 novembre 2026')
  })

  it('abrège les mois lorsque la semaine en traverse deux', () => {
    expect(formatWeekLabel('2026-12-02')).toBe('30 nov. – 6 déc. 2026')
  })

  it('affiche les deux années au changement d’année', () => {
    expect(formatWeekLabel('2026-01-01')).toBe('29 déc. 2025 – 4 janv. 2026')
  })

  it('abrège les jours sans point final', () => {
    expect(formatWeekdayShort('2026-11-09')).toBe('lun')
    expect(formatWeekdayShort('2026-11-15')).toBe('dim')
  })

  it('compte les jours calendaires dans les deux sens', () => {
    expect(differenceInCalendarDays('2026-11-10', '2026-11-12')).toBe(2)
    expect(differenceInCalendarDays('2026-11-12', '2026-11-10')).toBe(-2)
    expect(differenceInCalendarDays('2026-11-12', '2026-11-12')).toBe(0)
  })

  it('formate une échéance en J moins ou J plus', () => {
    expect(formatDaysUntil('2026-11-14', '2026-11-10')).toBe('J-4')
    expect(formatDaysUntil('2026-11-10', '2026-11-10')).toBe("Aujourd'hui")
    expect(formatDaysUntil('2026-11-08', '2026-11-10')).toBe('J+2')
  })
})

describe('minutes et heures', () => {
  it('formate des minutes en HH:MM', () => {
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(59)).toBe('00:59')
    expect(minutesToTime(840)).toBe('14:00')
    expect(minutesToTime(1439)).toBe('23:59')
    expect(minutesToTime(MINUTES_PER_DAY)).toBe('24:00')
  })

  it('refuse les minutes hors de la journée', () => {
    expect(() => minutesToTime(-1)).toThrow(RangeError)
    expect(() => minutesToTime(1441)).toThrow(RangeError)
    expect(() => minutesToTime(90.5)).toThrow(RangeError)
  })

  it('lit une heure HH:MM', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('09:05')).toBe(545)
    expect(timeToMinutes('14:00')).toBe(840)
    expect(timeToMinutes('23:59')).toBe(1439)
    expect(timeToMinutes('24:00')).toBe(MINUTES_PER_DAY)
  })

  it('refuse les heures invalides', () => {
    expect(() => timeToMinutes('24:01')).toThrow(RangeError)
    expect(() => timeToMinutes('25:00')).toThrow(RangeError)
    expect(() => timeToMinutes('12:60')).toThrow(RangeError)
    expect(() => timeToMinutes('9:00')).toThrow(RangeError)
  })

  it('accroche au pas de 15 minutes le plus proche', () => {
    expect(snapMinutes(0)).toBe(0)
    expect(snapMinutes(7)).toBe(0)
    expect(snapMinutes(8)).toBe(15)
    expect(snapMinutes(22)).toBe(15)
    expect(snapMinutes(23)).toBe(30)
    expect(snapMinutes(1439)).toBe(1440)
    expect(snapMinutes(44, 30)).toBe(30)
    expect(snapMinutes(45, 30)).toBe(60)
  })

  it('borne une position dans la journée', () => {
    expect(clampMinutes(-20)).toBe(0)
    expect(clampMinutes(600)).toBe(600)
    expect(clampMinutes(1450)).toBe(MINUTES_PER_DAY)
    expect(clampMinutes(600, 480, 720)).toBe(600)
    expect(clampMinutes(400, 480, 720)).toBe(480)
    expect(clampMinutes(800, 480, 720)).toBe(720)
  })

  it('formate une durée en minutes pour le panneau', () => {
    expect(formatDurationMinutes(0)).toBe('0 min')
    expect(formatDurationMinutes(45)).toBe('45 min')
    expect(formatDurationMinutes(60)).toBe('1 h')
    expect(formatDurationMinutes(90)).toBe('1 h 30')
    expect(formatDurationMinutes(120)).toBe('2 h')
    expect(formatDurationMinutes(195)).toBe('3 h 15')
  })

  it('refuse les durées négatives ou non entières', () => {
    expect(() => formatDurationMinutes(-1)).toThrow(RangeError)
    expect(() => formatDurationMinutes(45.5)).toThrow(RangeError)
  })

  it('lit une durée entière positive saisie en minutes', () => {
    expect(parsePositiveMinutes('45')).toBe(45)
    expect(parsePositiveMinutes(' 60 ')).toBe(60)
    expect(parsePositiveMinutes('0')).toBeNull()
    expect(parsePositiveMinutes('-5')).toBeNull()
    expect(parsePositiveMinutes('45,5')).toBeNull()
    expect(parsePositiveMinutes('45.5')).toBeNull()
    expect(parsePositiveMinutes('')).toBeNull()
  })
})
