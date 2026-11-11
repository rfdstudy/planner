import { describe, expect, it, vi } from 'vitest'
import { UndoHistory } from '../src/db/history'

describe('pile d’annulation', () => {
  it('annule les actions dans l’ordre inverse', async () => {
    const history = new UndoHistory()
    const calls: string[] = []

    history.push({
      label: 'première',
      undo: async () => {
        calls.push('première')
      }
    })
    history.push({
      label: 'seconde',
      undo: async () => {
        calls.push('seconde')
      }
    })

    expect(history.size).toBe(2)
    expect((await history.undo())?.label).toBe('seconde')
    expect((await history.undo())?.label).toBe('première')
    expect(await history.undo()).toBeNull()
    expect(calls).toEqual(['seconde', 'première'])
    expect(history.size).toBe(0)
  })

  it('ne conserve que les 50 dernières actions', async () => {
    const history = new UndoHistory()

    for (let index = 0; index < 55; index += 1) {
      history.push({
        label: `action ${index}`,
        undo: async () => undefined
      })
    }

    expect(history.size).toBe(50)

    const labels: string[] = []

    for (let index = 0; index < 50; index += 1) {
      const action = await history.undo()
      if (action !== null) labels.push(action.label)
    }

    expect(labels[0]).toBe('action 54')
    expect(labels[49]).toBe('action 5')
  })

  it('garde une action en pile si son annulation échoue', async () => {
    const history = new UndoHistory()
    const undo = vi.fn<() => Promise<void>>(async () => {
      throw new Error('échec')
    })

    history.push({ label: 'fragile', undo })

    await expect(history.undo()).rejects.toThrow('échec')
    expect(history.size).toBe(1)

    undo.mockImplementation(async () => undefined)
    expect((await history.undo())?.label).toBe('fragile')
    expect(history.size).toBe(0)
  })

  it('ignore une seconde annulation simultanée', async () => {
    const history = new UndoHistory()
    let release: (() => void) | undefined

    history.push({
      label: 'lente',
      undo: async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
    })

    const first = history.undo()
    expect(await history.undo()).toBeNull()

    if (release === undefined) {
      throw new Error('L’annulation n’a pas démarré.')
    }

    release()
    expect((await first)?.label).toBe('lente')
  })

  it('retire l’action annulée même si une autre est ajoutée entre-temps', async () => {
    const history = new UndoHistory()

    history.push({
      label: 'ancienne',
      undo: async () => {
        history.push({ label: 'nouvelle', undo: async () => undefined })
      }
    })

    expect((await history.undo())?.label).toBe('ancienne')
    expect(history.size).toBe(1)
    expect((await history.undo())?.label).toBe('nouvelle')
    expect(history.size).toBe(0)
  })

  it('peut être vidée', () => {
    const history = new UndoHistory()
    history.push({ label: 'action', undo: async () => undefined })
    history.clear()
    expect(history.size).toBe(0)
  })

  it('refuse une limite invalide', () => {
    expect(() => new UndoHistory(0)).toThrow(RangeError)
    expect(() => new UndoHistory(1.5)).toThrow(RangeError)
  })
})
